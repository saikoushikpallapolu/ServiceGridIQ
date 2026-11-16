import type { Prisma } from '@prisma/client';
import { reject } from '../auth/errors.js';
import { appointment, evaluateTechnician } from './policy.js';

export async function lockTechnician(tx: Prisma.TransactionClient, organizationId: string, id: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM technicians WHERE organization_id = ${organizationId}::uuid AND id = ${id}::uuid FOR UPDATE`;
  if (!rows.length) return reject(404, 'NOT_FOUND', 'Technician not found');
}
export async function eligibility(tx: Prisma.TransactionClient, organizationId: string, jobId: string, version: number, plannedStart: Date) {
  const job = await tx.job.findUnique({ where: { organizationId_id: { organizationId, id: jobId } }, include: { scheduling: { include: { requirements: { include: { skill: true } } } } } });
  if (!job) return reject(404, 'NOT_FOUND', 'Job not found');
  if (job.version !== version) return reject(409, 'VERSION_CONFLICT', 'This job changed. Reload it before checking eligibility');
  if (!['TRIAGED', 'READY'].includes(job.status)) return reject(409, 'INTAKE_REQUIRED', 'Triage this job before checking eligibility');
  if (!job.scheduling) return reject(409, 'POLICY_REQUIRED', 'Save a branch and qualification policy first');
  if (job.scheduling.generalInspection ? job.scheduling.requirements.length > 0 : job.scheduling.requirements.length === 0) return reject(409, 'POLICY_REQUIRED', 'Confirm general inspection or specify required qualifications');
  if (plannedStart < job.arrivalStart || plannedStart >= job.arrivalEnd) return reject(400, 'OUTSIDE_ARRIVAL_WINDOW', 'Planned arrival must be at or after the window start and before its end');
  const slot = appointment(plannedStart, job.estimatedDurationMinutes, job.travelBufferMinutes);
  const now = new Date();
  const technicians = await tx.technician.findMany({ where: { organizationId }, include: { branch: true, membership: { include: { user: true } }, skills: true,
    availability: { where: { startsAt: { lt: slot.endsAt }, endsAt: { gt: slot.reservedFrom } } }, reservations: { where: { active: true, reservedFrom: { lt: slot.endsAt }, endsAt: { gt: slot.reservedFrom } } } }, orderBy: { id: 'asc' } });
  return { jobVersion: job.version, evaluatedAt: now, appointment: slot, candidates: technicians.map((tech) => ({ technicianId: tech.id, name: tech.membership.user.name, branchName: tech.branch.name,
    ...evaluateTechnician({ active: tech.active, safetyRestricted: tech.safetyRestricted, branchId: tech.branchId, membershipActive: tech.membership.active && tech.membership.user.active && tech.membership.role === 'TECHNICIAN', policy: { ...job.scheduling!, requirements: job.scheduling!.requirements.map((item) => ({ ...item, name: item.skill.name })) }, skills: tech.skills, availability: tech.availability, reservations: tech.reservations, slot, now }) })) };
}

// Internal scheduling primitive, deliberately not exposed as an HTTP booking route.
// Phase 5 must wrap this in readiness, approval, idempotency, lifecycle and outbox writes.
// Callers hold the company authorization lock first; lock order is company → job → technician.
export async function reserveEligibleSlot(tx: Prisma.TransactionClient, organizationId: string, jobId: string, version: number, plannedStart: Date, technicianId: string) {
  await tx.$queryRaw`SELECT id FROM jobs WHERE organization_id = ${organizationId}::uuid AND id = ${jobId}::uuid FOR UPDATE`;
  await lockTechnician(tx, organizationId, technicianId);
  const result = await eligibility(tx, organizationId, jobId, version, plannedStart);
  if (!result.candidates.find((item) => item.technicianId === technicianId)?.eligible) return reject(409, 'INELIGIBLE', 'Technician is no longer eligible for this appointment');
  return tx.appointmentReservation.create({ data: { organizationId, jobId, technicianId, ...result.appointment } });
}
