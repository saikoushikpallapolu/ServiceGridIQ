import { createHash } from 'node:crypto';
import { Prisma, type Membership, type PrismaClient } from '@prisma/client';
import { reject } from '../auth/errors.js';
import { audit, intakeWrite } from '../intake/service.js';
import { eligibility, reserveEligibleSlot } from '../scheduling/service.js';
import { confirmationCurrent, MANUAL_PARTS_NOTICE, organizationDay, overallReadiness, rankingFeatures, workload, type Check } from './policy.js';
import { reserveRequiredParts } from '../inventory/ledger.js';

export const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
export async function editableJob(tx: Prisma.TransactionClient, organizationId: string, jobId: string, version: number) {
  await tx.$queryRaw`SELECT id FROM jobs WHERE organization_id = ${organizationId}::uuid AND id = ${jobId}::uuid FOR UPDATE`;
  const job = await tx.job.findUnique({ where: { organizationId_id: { organizationId, id: jobId } } });
  if (!job) return reject(404, 'NOT_FOUND', 'Job not found');
  if (job.version !== version) return reject(409, 'VERSION_CONFLICT', 'This job changed. Reload before saving');
  if (!['DRAFT', 'TRIAGED', 'READY'].includes(job.status) || await tx.appointmentReservation.count({ where: { organizationId, jobId, active: true } })) return reject(409, 'JOB_LOCKED', 'Assigned jobs require the reschedule workflow before preparation can change');
  return job;
}
export async function preparationChanged(tx: Prisma.TransactionClient, actor: Membership, jobId: string, action: string, details: Prisma.InputJsonObject = {}) {
  const job = await tx.job.findUniqueOrThrow({ where: { organizationId_id: { organizationId: actor.organizationId, id: jobId } } });
  const updated = await tx.job.update({ where: { id: jobId }, data: { status: job.status === 'READY' ? 'TRIAGED' : job.status, readySnapshot: Prisma.DbNull, warningAcknowledgments: {}, version: { increment: 1 } } });
  await tx.jobEvent.create({ data: { organizationId: actor.organizationId, jobId, actorMembershipId: actor.id, kind: action, note: action.toLowerCase().replaceAll('_', ' '), details: { ...details, version: updated.version } } });
  await audit(tx, actor, action, jobId, { ...details, version: updated.version }); return { jobVersion: updated.version };
}
export async function readiness(tx: Prisma.TransactionClient, organizationId: string, jobId: string, now = new Date()) {
  const job = await tx.job.findUnique({ where: { organizationId_id: { organizationId, id: jobId } }, include: { organization: { include: { inventoryPolicy: true } }, assignments: { orderBy: [{ active: 'desc' }, { approvedAt: 'desc' }], take: 1 }, site: true, equipment: true, scheduling: { include: { requirements: true } },
    partRequirements: { include: { part: true, location: true, confirmations: { orderBy: [{ recordedJobVersion: 'desc' }, { id: 'desc' }], take: 1, include: { actor: { include: { user: true } } } } } },
    prerequisites: { include: { evidence: { orderBy: [{ recordedJobVersion: 'desc' }, { id: 'desc' }], take: 1, include: { actor: { include: { user: true } } } } } } } });
  if (!job) return reject(404, 'NOT_FOUND', 'Job not found');
  const acknowledgments = job.warningAcknowledgments as Record<string, { reason: string }>;
  const checks: Check[] = [];
  const existingAssignment = !['DRAFT', 'TRIAGED', 'READY'].includes(job.status) ? job.assignments[0] : undefined;
  const ledgerMode = existingAssignment ? existingAssignment.inventoryMode === 'LEDGER' : job.organization.inventoryPolicy?.enabled === true;
  const add = (code: string, status: Check['status'], severity: Check['severity'], message: string, evidenceId: string | null = null, verifiedBy: string | null = null, verifiedAt: Date | null = null) => checks.push({ code, status, severity, message, evidenceId, verifiedBy, verifiedAt: verifiedAt?.toISOString() ?? null, acknowledged: severity === 'WARNING' && !!acknowledgments[code]?.reason });
  add('INTAKE', job.complaint.trim() && job.serviceCategory.trim() && job.site.address.trim() ? 'PASS' : 'FAIL', 'BLOCKER', 'Complaint, service category, equipment and site address must be recorded.');
  add('TRIAGED', ['TRIAGED', 'READY', 'ASSIGNED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'CLOSED'].includes(job.status) ? 'PASS' : 'FAIL', 'BLOCKER', 'Intake must be triaged before approval.');
  const planned = job.plannedStart;
  add('APPOINTMENT', planned && planned >= job.arrivalStart && planned < job.arrivalEnd && planned > now ? 'PASS' : 'UNKNOWN', 'BLOCKER', 'Save a future arrival inside the customer window, with explicit work and travel estimates.');
  add('QUALIFICATION_POLICY', job.scheduling && (job.scheduling.generalInspection ? job.scheduling.requirements.length === 0 : job.scheduling.requirements.length > 0) ? 'PASS' : 'UNKNOWN', 'BLOCKER', 'Specify required skills or explicitly select general inspection and a service branch.');
  add('PARTS_REVIEW', job.partsReviewed ? 'PASS' : 'UNKNOWN', 'BLOCKER', 'A dispatcher must explicitly review whether parts are needed.');
  add('PREREQUISITES_REVIEW', job.prerequisitesReviewed ? 'PASS' : 'UNKNOWN', 'BLOCKER', 'A dispatcher must explicitly review safety and access prerequisites.');
  for (const part of job.partRequirements) {
    if (part.state === 'NOT_NEEDED') continue;
    if (ledgerMode) {
      const balance = await tx.stockBalance.findUnique({ where: { organizationId_partId_locationId: { organizationId, partId: part.partId, locationId: part.locationId } } });
      const allocation = existingAssignment ? await tx.stockAllocation.findFirst({ where: { organizationId, assignmentId: existingAssignment.id, jobPartId: part.id } }) : null;
      const owned = allocation ? allocation.state === 'RELEASED' ? allocation.consumed : allocation.quantity : new Prisma.Decimal(0);
      const sufficient = !!balance && balance.onHand.sub(balance.reserved).add(owned).gte(part.quantity);
      add(`PART:${part.id}`, sufficient ? 'PASS' : balance ? 'FAIL' : 'UNKNOWN', part.state === 'REQUIRED' ? 'BLOCKER' : 'WARNING', `${part.state}: ${part.part.name}, ${part.quantity.toString()} ${part.part.unit} at ${part.location.name}. Ledger-backed availability${existingAssignment ? ' including this visit allocation/recorded consumption' : ''}; only REQUIRED quantities are protected at assignment.`); continue;
    }
    const evidence = part.confirmations[0] ?? null;
    const current = confirmationCurrent({ revision: part.revision, visitRevision: job.visitRevision, plannedStart: planned, hours: job.organization.partsFreshnessHours, now, confirmation: evidence });
    add(`PART:${part.id}`, current ? 'PASS' : evidence?.status === 'UNAVAILABLE' ? 'FAIL' : 'UNKNOWN', part.state === 'REQUIRED' ? 'BLOCKER' : 'WARNING', `${part.state}: ${part.part.name}, ${part.quantity.toString()} ${part.part.unit}, at ${part.location.name}. Current positive manual confirmation is required for REQUIRED parts.`, evidence?.id ?? null, evidence?.actor.user.name ?? null, evidence?.confirmedAt ?? null);
  }
  for (const prerequisite of job.prerequisites) {
    const evidence = prerequisite.evidence[0] ?? null;
    const current = !!evidence && !!planned && evidence.plannedStart.getTime() === planned.getTime() && evidence.visitRevision === job.visitRevision && evidence.verifiedAt <= now;
    add(`PREREQUISITE:${prerequisite.id}`, current ? evidence.status as Check['status'] : 'UNKNOWN', 'BLOCKER', `${prerequisite.kind}: ${prerequisite.label}. ${prerequisite.rationale}`, evidence?.id ?? null, evidence?.actor.user.name ?? null, evidence?.verifiedAt ?? null);
  }
  return { job, result: { inventoryMode: ledgerMode ? 'LEDGER' as const : 'MANUAL' as const, status: overallReadiness(checks), jobVersion: job.version, policyVersion: job.organization.preparationPolicyVersion, evaluatedAt: now.toISOString(), plannedStart: planned?.toISOString() ?? null, checks, manualPartsNotice: ledgerMode ? 'Ledger-backed REQUIRED parts are reserved atomically at assignment. Suspected parts are advisory; physical stock accuracy still requires reconciliation.' : MANUAL_PARTS_NOTICE } };
}
export async function rankTechnicians(tx: Prisma.TransactionClient, organizationId: string, jobId: string, version: number) {
  const ready = await readiness(tx, organizationId, jobId);
  if (ready.job.version !== version) return reject(409, 'VERSION_CONFLICT', 'Job changed. Reload before ranking');
  if (!ready.job.plannedStart) return reject(409, 'APPOINTMENT_REQUIRED', 'Save a proposed arrival first');
  const evaluation = await eligibility(tx, organizationId, jobId, version, ready.job.plannedStart);
  const day = organizationDay(ready.job.plannedStart, ready.job.organization.timezone);
  const profiles = await tx.technician.findMany({ where: { organizationId }, include: { skills: true, availability: { where: { startsAt: { lt: new Date(day.end) }, endsAt: { gt: new Date(day.start) } } }, reservations: { where: { active: true, reservedFrom: { lt: new Date(day.end) }, endsAt: { gt: new Date(day.start) } } } } });
  const history = await tx.assignment.groupBy({ by: ['technicianId'], where: { organizationId, job: { equipmentId: ready.job.equipmentId }, resolvedAt: { gte: new Date(Date.now() - 365 * 86400_000), lte: new Date() } }, _count: { id: true } });
  const candidates = evaluation.candidates.map((candidate) => {
    const profile = profiles.find((item) => item.id === candidate.technicianId)!;
    const span = (start: Date, end: Date) => ({ start: start.getTime(), end: end.getTime() });
    const capacity = workload(profile.availability.filter((item) => item.kind === 'SHIFT').map((item) => span(item.startsAt, item.endsAt)), profile.availability.filter((item) => item.kind === 'UNAVAILABLE').map((item) => span(item.startsAt, item.endsAt)), profile.reservations.map((item) => span(item.reservedFrom, item.endsAt)), day);
    const levels = ready.job.scheduling!.requirements.map((requirement) => ({ required: requirement.level, actual: profile.skills.find((item) => item.skillId === requirement.skillId && item.active)?.level ?? 0 }));
    const resolvedVisits = history.find((item) => item.technicianId === profile.id)?._count.id ?? 0;
    const features = rankingFeatures(levels, capacity.workloadHeadroom, resolvedVisits);
    return { ...candidate, ...features, ...capacity, score: candidate.eligible ? features.score : null, resolvedVisits, historyStatus: resolvedVisits ? 'AVAILABLE' as const : 'NO_HISTORY' as const };
  }).sort((a, b) => Number(b.eligible) - Number(a.eligible) || (b.score ?? -1) - (a.score ?? -1) || a.bookedMinutes - b.bookedMinutes || a.technicianId.localeCompare(b.technicianId));
  return { policyVersion: 'dispatch-v2' as const, jobVersion: version, evaluatedAt: evaluation.evaluatedAt, readiness: ready.result, appointment: evaluation.appointment, candidates };
}
export async function approveAssignment(db: PrismaClient, actor: Membership, jobId: string, input: { version: number; technicianId: string; approvalReason: string }, key: string) {
  const requestHash = createHash('sha256').update(JSON.stringify({ jobId, ...input })).digest('hex');
  return intakeWrite(db, actor, async (tx) => {
    const organizationId = actor.organizationId;
    const previous = await tx.idempotencyRecord.findUnique({ where: { organizationId_key: { organizationId, key } } });
    if (previous) { if (previous.actorMembershipId !== actor.id || previous.requestHash !== requestHash) return reject(409, 'IDEMPOTENCY_CONFLICT', 'This request key was already used for another approval'); return previous.response; }
    await tx.$queryRaw`SELECT id FROM jobs WHERE organization_id = ${organizationId}::uuid AND id = ${jobId}::uuid FOR UPDATE`;
    const current = await readiness(tx, organizationId, jobId);
    if (current.job.version !== input.version) return reject(409, 'VERSION_CONFLICT', 'Job changed. Review the current preparation before assigning');
    if (current.job.status !== 'READY') return reject(409, 'NOT_READY', 'Mark the job ready before approving assignment');
    if ((current.job.readySnapshot as { policyVersion?: number } | null)?.policyVersion !== current.result.policyVersion) return reject(409, 'POLICY_CHANGED', 'Readiness policy changed. Mark ready again');
    if (current.result.status !== 'READY') return reject(422, 'READINESS_BLOCKED', 'Resolve current blockers and acknowledge warnings before assigning');
    const ranking = await rankTechnicians(tx, organizationId, jobId, input.version);
    if (!ranking.candidates.find((item) => item.technicianId === input.technicianId)?.eligible) return reject(409, 'INELIGIBLE', 'Selected technician is not currently eligible');
    const reservation = await reserveEligibleSlot(tx, organizationId, jobId, input.version, current.job.plannedStart!, input.technicianId);
    const ledgerMode = current.job.organization.inventoryPolicy?.enabled === true;
    const assignment = await tx.assignment.create({ data: { organizationId, jobId, technicianId: input.technicianId, reservationId: reservation.id, approvedByMembershipId: actor.id, approvalReason: input.approvalReason, readinessSnapshot: json(current.result), rankingSnapshot: json(ranking), inventoryMode: ledgerMode ? 'LEDGER' : 'MANUAL' } });
    if (ledgerMode) await reserveRequiredParts(tx, actor, jobId, assignment.id);
    const updated = await tx.job.update({ where: { id: jobId }, data: { status: 'ASSIGNED', version: { increment: 1 } } });
    await tx.jobEvent.create({ data: { organizationId, jobId, actorMembershipId: actor.id, kind: 'JOB_ASSIGNED', note: input.approvalReason, details: { assignmentId: assignment.id, technicianId: input.technicianId, version: updated.version } } });
    await audit(tx, actor, 'JOB_ASSIGNED', jobId, { assignmentId: assignment.id, technicianId: input.technicianId, version: updated.version });
    await tx.outboxEvent.create({ data: { organizationId, assignmentId: assignment.id, kind: 'ASSIGNMENT_APPROVED', payload: { assignmentId: assignment.id, jobId, technicianId: input.technicianId } } });
    const response = { assignmentId: assignment.id, jobId, jobVersion: updated.version, status: 'ASSIGNED' };
    await tx.idempotencyRecord.create({ data: { organizationId, key, requestHash, actorMembershipId: actor.id, response } }); return response;
  });
}
