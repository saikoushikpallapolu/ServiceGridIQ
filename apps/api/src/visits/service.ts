import { createHash } from 'node:crypto';
import { Prisma, type Membership, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { validArrivalWindow, type closeVisitInputSchema, type observationInputSchema, type rescheduleVisitInputSchema } from '@servicegrid/contracts';
import { reject } from '../auth/errors.js';
import { audit, companyWrite } from '../intake/service.js';
import { lockTechnician } from '../scheduling/service.js';
import { readiness } from '../dispatch/service.js';
import { releaseStock } from '../inventory/ledger.js';

export const visitInclude = { reservation: true, approver: { include: { user: true } }, technician: { include: { membership: { include: { user: true } }, skills: true } }, job: { include: { site: { include: { customer: true } }, equipment: true, followUp: { select: { id: true } }, closure: { include: { actor: { include: { user: true } } } }, scheduling: { include: { requirements: true } } } } } as const;
type Visit = Prisma.AssignmentGetPayload<{ include: typeof visitInclude }>;
export function canReadVisit(actor: Membership, assignment: Visit) {
  if (actor.role !== 'TECHNICIAN') return ['OWNER', 'DISPATCHER'].includes(actor.role);
  if (!assignment.technician.active || assignment.technician.membershipId !== actor.id) return false;
  return assignment.active || (assignment.releaseKind === 'CLOSED' && assignment.job.closure?.assignmentId === assignment.id) || (assignment.releaseKind === 'CANCELLED' && assignment.job.status === 'CANCELLED');
}
export async function visitCard(tx: Prisma.TransactionClient, actor: Membership, id: string) {
  const assignment = await tx.assignment.findUnique({ where: { organizationId_id: { organizationId: actor.organizationId, id } }, include: visitInclude });
  if (!assignment || !canReadVisit(actor, assignment)) return reject(404, 'NOT_FOUND', 'Visit not found');
  const current = await readiness(tx, actor.organizationId, assignment.jobId);
  const observations = await tx.visitObservation.findMany({ where: { organizationId: actor.organizationId, assignmentId: id }, include: { actor: { include: { user: true } } }, orderBy: [{ recordedJobVersion: 'desc' }, { id: 'desc' }], take: 200 });
  const { site, equipment, followUp, closure, scheduling, ...jobCore } = assignment.job;
  void scheduling;
  return { assignment: { id: assignment.id, jobId: assignment.jobId, technicianId: assignment.technicianId, technicianName: assignment.technician.membership.user.name, approvedByName: assignment.approver.user.name, approvedAt: assignment.approvedAt, approvalReason: assignment.approvalReason, active: assignment.active, inventoryMode: assignment.inventoryMode, acknowledgedAt: assignment.acknowledgedAt, startedAt: assignment.startedAt, endedAt: assignment.endedAt, releaseKind: assignment.releaseKind, releaseReason: assignment.releaseReason, reservedFrom: assignment.reservation.reservedFrom, plannedStart: assignment.reservation.plannedStart, endsAt: assignment.reservation.endsAt },
    job: jobCore, customer: site.customer, site, equipment, approvalReadiness: { ...(assignment.readinessSnapshot as Prisma.JsonObject), inventoryMode: assignment.inventoryMode },
    currentEvidence: current.result.checks.filter((item) => item.code.startsWith('PART:') || item.code.startsWith('PREREQUISITE:')),
    parts: [...new Map(current.job.partRequirements.map((part) => [part.partId, { partId: part.partId, name: part.part.name, unit: part.part.unit }])).values()],
    observations: observations.reverse().map(({ actor, quantity, ...row }) => ({ ...row, quantity: quantity?.toString() ?? null, actorName: actor.user.name })),
    closure: closure ? { outcome: closure.outcome, followUpReason: closure.followUpReason, notes: closure.notes, closedAt: closure.closedAt, actorName: closure.actor.user.name } : null, followUpJobId: followUp?.id ?? null };
}
type ActionInput = { version: number; assignmentId: string | null };
export function createVisitService(db: PrismaClient) {
  async function mutate(actor: Membership, jobId: string, operation: string, input: ActionInput, key: string, access: 'TECHNICIAN' | 'MANAGER' | 'VISIT', work: (tx: Prisma.TransactionClient, job: Prisma.JobGetPayload<object>, assignment: Visit | null, current: Membership) => Promise<{ status: string; version: number; followUpJobId?: string; observationId?: string }>) {
    const requestHash = createHash('sha256').update(JSON.stringify({ operation, jobId, input })).digest('hex');
    return companyWrite(db, actor, ['OWNER', 'DISPATCHER', 'TECHNICIAN'], async (tx, current) => {
      await tx.$queryRaw`SELECT id FROM jobs WHERE organization_id = ${current.organizationId}::uuid AND id = ${jobId}::uuid FOR UPDATE`;
      const job = await tx.job.findUnique({ where: { organizationId_id: { organizationId: current.organizationId, id: jobId } } }); if (!job) return reject(404, 'NOT_FOUND', 'Job not found');
      const assignment = input.assignmentId ? await tx.assignment.findFirst({ where: { organizationId: current.organizationId, jobId, id: input.assignmentId }, include: visitInclude }) : null;
      if (input.assignmentId && !assignment) return reject(404, 'NOT_FOUND', 'Visit not found');
      if (access === 'TECHNICIAN' && current.role !== 'TECHNICIAN') return reject(403, 'FORBIDDEN', 'Only the assigned technician can acknowledge or start');
      if (access === 'MANAGER' && !['OWNER', 'DISPATCHER'].includes(current.role)) return reject(403, 'FORBIDDEN', 'Dispatcher or owner access required');
      if (current.role === 'TECHNICIAN' && (!assignment || !canReadVisit(current, assignment))) return reject(404, 'NOT_FOUND', 'Visit not found');
      const previous = await tx.idempotencyRecord.findUnique({ where: { organizationId_key: { organizationId: current.organizationId, key } } });
      if (previous) { if (previous.requestHash !== requestHash || previous.actorMembershipId !== current.id) return reject(409, 'IDEMPOTENCY_CONFLICT', 'Request key was used for another action'); return previous.response; }
      if (job.version !== input.version) return reject(409, 'VERSION_CONFLICT', 'Visit changed. Reload and review before trying again');
      if (assignment) await lockTechnician(tx, current.organizationId, assignment.technicianId);
      const result = await work(tx, job, assignment, current);
      const response = { jobId, jobVersion: result.version, status: result.status, assignmentId: assignment?.id ?? null, followUpJobId: result.followUpJobId ?? null, ...(result.observationId ? { observationId: result.observationId } : {}) };
      await tx.idempotencyRecord.create({ data: { organizationId: current.organizationId, key, requestHash, actorMembershipId: current.id, response } }); return response;
    });
  }
  async function event(tx: Prisma.TransactionClient, actor: Membership, jobId: string, assignmentId: string | null, kind: string, note: string, details: Prisma.InputJsonObject = {}) {
    await tx.jobEvent.create({ data: { organizationId: actor.organizationId, jobId, actorMembershipId: actor.id, kind, note, details } }); await audit(tx, actor, kind, jobId, details);
    if (assignmentId && kind !== 'VISIT_OBSERVATION_RECORDED') await tx.outboxEvent.create({ data: { organizationId: actor.organizationId, assignmentId, kind, payload: { jobId, assignmentId, ...details } } });
  }
  const active = (assignment: Visit | null) => { if (!assignment?.active || !assignment.reservation.active) return reject(409, 'STALE_ASSIGNMENT', 'This assignment is no longer active'); return assignment; };
  const release = async (tx: Prisma.TransactionClient, assignment: Visit, kind: string, reason: string, now: Date, actor: Membership) => { await releaseStock(tx, actor, assignment.id, `${kind}: ${reason}`); await tx.appointmentReservation.update({ where: { id: assignment.reservationId }, data: { active: false } }); await tx.assignment.update({ where: { id: assignment.id }, data: { active: false, releasedAt: now, releaseKind: kind, releaseReason: reason } }); };
  return {
    acknowledge: (actor: Membership, jobId: string, input: ActionInput, key: string) => mutate(actor, jobId, 'ACKNOWLEDGE', input, key, 'TECHNICIAN', async (tx, job, row, current) => {
      const assignment = active(row); if (job.status !== 'ASSIGNED') return reject(409, 'INVALID_TRANSITION', 'Only an assigned visit can be acknowledged');
      await tx.assignment.update({ where: { id: assignment.id }, data: { acknowledgedAt: new Date() } }); const updated = await tx.job.update({ where: { id: jobId }, data: { status: 'ACKNOWLEDGED', version: { increment: 1 } } });
      await event(tx, current, jobId, assignment.id, 'VISIT_ACKNOWLEDGED', 'Assigned technician acknowledged preparation.', { version: updated.version }); return { status: updated.status, version: updated.version };
    }),
    start: (actor: Membership, jobId: string, input: ActionInput, key: string) => mutate(actor, jobId, 'START', input, key, 'TECHNICIAN', async (tx, job, row, current) => {
      const assignment = active(row); if (job.status !== 'ACKNOWLEDGED') return reject(409, 'INVALID_TRANSITION', 'Acknowledge preparation before starting');
      if (assignment.technician.safetyRestricted) return reject(409, 'SAFETY_RESTRICTED', 'Technician has a recorded safety restriction');
      const now = new Date();
      if (assignment.job.scheduling?.requirements.some((required) => !assignment.technician.skills.some((skill) => skill.skillId === required.skillId && skill.active && skill.level >= required.level && (!skill.expiresAt || skill.expiresAt > now)))) return reject(409, 'QUALIFICATION_EXPIRED', 'A required qualification is no longer valid');
      if (await tx.assignment.count({ where: { organizationId: current.organizationId, technicianId: assignment.technicianId, active: true, startedAt: { not: null }, endedAt: null } })) return reject(409, 'VISIT_IN_PROGRESS', 'Complete the current visit before starting another');
      await tx.assignment.update({ where: { id: assignment.id }, data: { startedAt: now } }); const updated = await tx.job.update({ where: { id: jobId }, data: { status: 'IN_PROGRESS', version: { increment: 1 } } });
      await event(tx, current, jobId, assignment.id, 'VISIT_STARTED', 'Actual start recorded; planned reservation was not moved.', { version: updated.version }); return { status: updated.status, version: updated.version };
    }),
    observe: (actor: Membership, jobId: string, input: z.infer<typeof observationInputSchema>, key: string) => mutate(actor, jobId, 'OBSERVATION', input, key, 'VISIT', async (tx, job, row, current) => {
      if (!row || !['IN_PROGRESS', 'CLOSED'].includes(job.status)) return reject(409, 'INVALID_TRANSITION', 'Observations require an in-progress visit or a closed-visit annotation');
      if (job.status === 'IN_PROGRESS') active(row); else if (row.job.closure?.assignmentId !== row.id || input.kind === 'PART_USAGE') return reject(409, 'CLOSED_IMMUTABLE', 'Closed outcomes cannot be changed; append a note or correction instead');
      if (input.kind === 'PART_USAGE' ? !input.quantity || (!!input.partId === !!input.partLabel) || !!input.correctsId : !!input.partId || !!input.partLabel || !!input.quantity) return reject(400, 'INVALID_OBSERVATION', 'Parts usage requires quantity and a part; notes/corrections cannot alter accounting fields');
      if ((input.kind === 'CORRECTION') !== !!input.correctsId) return reject(400, 'CORRECTION_REQUIRED', 'A correction must reference an existing observation');
      if (input.correctsId && !await tx.visitObservation.findFirst({ where: { organizationId: current.organizationId, jobId, assignmentId: row.id, id: input.correctsId } })) return reject(404, 'NOT_FOUND', 'Original observation not found');
      if (input.partId && !await tx.jobPart.findFirst({ where: { organizationId: current.organizationId, jobId, partId: input.partId } })) return reject(404, 'NOT_FOUND', 'Part is not in this visit context; use a free-text label for unexpected reported usage');
      const observation = await tx.visitObservation.create({ data: { organizationId: current.organizationId, jobId, assignmentId: row.id, actorMembershipId: current.id, recordedJobVersion: job.version + 1, kind: input.kind, note: input.note, partId: input.partId, partLabel: input.partLabel, quantity: input.quantity, correctsId: input.correctsId } });
      const updated = await tx.job.update({ where: { id: jobId }, data: { version: { increment: 1 } } }); await event(tx, current, jobId, row.id, 'VISIT_OBSERVATION_RECORDED', input.note, { observationId: observation.id, kind: input.kind, version: updated.version }); return { status: updated.status, version: updated.version, observationId: observation.id };
    }),
    close: (actor: Membership, jobId: string, input: z.infer<typeof closeVisitInputSchema>, key: string) => mutate(actor, jobId, 'CLOSE', input, key, 'VISIT', async (tx, job, row, current) => {
      const assignment = active(row); if (job.status !== 'IN_PROGRESS') return reject(409, 'INVALID_TRANSITION', 'Only an in-progress visit can be closed');
      if (assignment.inventoryMode === 'LEDGER' && !input.inventoryReviewed) return reject(400, 'INVENTORY_REVIEW_REQUIRED', 'Record actual stock consumption and confirm inventory review before closing; unused allocations will be released');
      if (input.outcome === 'FOLLOW_UP_REQUIRED' ? !input.followUpReason || !input.followUpWindow : !!input.followUpReason || !!input.followUpWindow) return reject(400, 'INVALID_OUTCOME', 'Follow-up requires a reason and new arrival window; resolved closure must omit them');
      const now = new Date();
      if (input.followUpWindow && (!validArrivalWindow(input.followUpWindow) || new Date(input.followUpWindow.arrivalStart) <= now)) return reject(400, 'INVALID_FOLLOW_UP_WINDOW', 'Choose a valid future follow-up window of at most seven days');
      await tx.visitClosure.create({ data: { organizationId: current.organizationId, jobId, assignmentId: assignment.id, actorMembershipId: current.id, outcome: input.outcome, followUpReason: input.followUpReason, notes: input.notes, closedAt: now } });
      await release(tx, assignment, 'CLOSED', input.outcome, now, current); await tx.assignment.update({ where: { id: assignment.id }, data: { endedAt: now, resolvedAt: input.outcome === 'RESOLVED' ? now : null } });
      let followUpJobId: string | undefined;
      if (input.followUpWindow) {
        const child = await tx.job.create({ data: { organizationId: current.organizationId, jobType: 'FOLLOW_UP', parentJobId: job.id, rootJobId: job.rootJobId ?? job.id, customerId: job.customerId, siteId: job.siteId, equipmentId: job.equipmentId, complaint: job.complaint, serviceCategory: job.serviceCategory, priority: job.priority, arrivalStart: new Date(input.followUpWindow.arrivalStart), arrivalEnd: new Date(input.followUpWindow.arrivalEnd), estimatedDurationMinutes: job.estimatedDurationMinutes, travelBufferMinutes: job.travelBufferMinutes } }); followUpJobId = child.id;
        const source = await tx.job.findUniqueOrThrow({ where: { id: jobId }, include: { scheduling: { include: { requirements: true } }, partRequirements: true, prerequisites: true } });
        if (source.scheduling) { const policy = await tx.jobScheduling.create({ data: { organizationId: current.organizationId, jobId: child.id, branchId: source.scheduling.branchId, allowCrossBranch: source.scheduling.allowCrossBranch, generalInspection: source.scheduling.generalInspection } }); await tx.jobSkillRequirement.createMany({ data: source.scheduling.requirements.map((required) => ({ organizationId: current.organizationId, schedulingId: policy.id, skillId: required.skillId, level: required.level })) }); }
        await tx.jobPart.createMany({ data: source.partRequirements.map((part) => ({ organizationId: current.organizationId, jobId: child.id, partId: part.partId, locationId: part.locationId, quantity: part.quantity, state: part.state, reason: part.reason })) });
        await tx.jobPrerequisite.createMany({ data: source.prerequisites.map((item) => ({ organizationId: current.organizationId, jobId: child.id, code: item.code, kind: item.kind, label: item.label, rationale: item.rationale })) });
        await event(tx, current, child.id, null, 'FOLLOW_UP_CREATED', input.notes, { parentJobId: jobId, rootJobId: job.rootJobId ?? jobId, reason: input.followUpReason });
      }
      const updated = await tx.job.update({ where: { id: jobId }, data: { status: 'CLOSED', version: { increment: 1 } } }); await event(tx, current, jobId, assignment.id, 'VISIT_CLOSED', input.notes, { outcome: input.outcome, followUpReason: input.followUpReason, followUpJobId: followUpJobId ?? null, version: updated.version }); return { status: updated.status, version: updated.version, followUpJobId };
    }),
    cancel: (actor: Membership, jobId: string, input: ActionInput & { reason: string }, key: string) => mutate(actor, jobId, 'CANCEL', input, key, 'MANAGER', async (tx, job, row, current) => {
      if (!['DRAFT', 'TRIAGED', 'READY', 'ASSIGNED', 'ACKNOWLEDGED'].includes(job.status)) return reject(409, 'INVALID_TRANSITION', 'In-progress or terminal jobs cannot be cancelled');
      const currentAssignment = await tx.assignment.findFirst({ where: { organizationId: current.organizationId, jobId, active: true } }); if ((currentAssignment?.id ?? null) !== input.assignmentId) return reject(409, 'STALE_ASSIGNMENT', 'Reload the current assignment before cancelling');
      if (currentAssignment) await release(tx, active(row), 'CANCELLED', input.reason, new Date(), current);
      const updated = await tx.job.update({ where: { id: jobId }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: input.reason, readySnapshot: Prisma.DbNull, version: { increment: 1 } } }); await event(tx, current, jobId, row?.id ?? null, 'JOB_CANCELLED', input.reason, { version: updated.version }); return { status: updated.status, version: updated.version };
    }),
    reschedule: (actor: Membership, jobId: string, input: z.infer<typeof rescheduleVisitInputSchema>, key: string) => mutate(actor, jobId, 'RESCHEDULE', input, key, 'MANAGER', async (tx, job, row, current) => {
      const assignment = active(row); if (!['ASSIGNED', 'ACKNOWLEDGED'].includes(job.status)) return reject(409, 'INVALID_TRANSITION', 'Only assigned or acknowledged visits can be rescheduled');
      if (!validArrivalWindow(input) || new Date(input.arrivalStart) <= new Date()) return reject(400, 'INVALID_WINDOW', 'Choose a valid future arrival window of at most seven days');
      await release(tx, assignment, 'RESCHEDULED', input.reason, new Date(), current);
      const updated = await tx.job.update({ where: { id: jobId }, data: { status: 'TRIAGED', arrivalStart: new Date(input.arrivalStart), arrivalEnd: new Date(input.arrivalEnd), estimatedDurationMinutes: input.estimatedDurationMinutes, travelBufferMinutes: input.travelBufferMinutes, plannedStart: null, partsReviewed: false, prerequisitesReviewed: false, readySnapshot: Prisma.DbNull, warningAcknowledgments: {}, visitRevision: { increment: 1 }, version: { increment: 1 } } });
      await event(tx, current, jobId, assignment.id, 'VISIT_RESCHEDULED', input.reason, { oldArrivalStart: job.arrivalStart.toISOString(), oldArrivalEnd: job.arrivalEnd.toISOString(), newArrivalStart: input.arrivalStart, newArrivalEnd: input.arrivalEnd, oldDuration: job.estimatedDurationMinutes, oldTravelBuffer: job.travelBufferMinutes, version: updated.version }); return { status: updated.status, version: updated.version };
    }),
  };
}
