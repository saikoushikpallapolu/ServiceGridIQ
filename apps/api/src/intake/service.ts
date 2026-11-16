import { Prisma, type Membership, type PrismaClient } from '@prisma/client';
import { reject } from '../auth/errors.js';
import { validArrivalWindow, type JobInput } from '@servicegrid/contracts';

export async function intakeWrite<T>(db: PrismaClient, actor: Membership, work: (tx: Prisma.TransactionClient) => Promise<T>) {
  return companyWrite(db, actor, ['OWNER', 'DISPATCHER'], (tx) => work(tx));
}
export async function companyWrite<T>(db: PrismaClient, actor: Membership, roles: Membership['role'][], work: (tx: Prisma.TransactionClient, current: Membership) => Promise<T>, options?: { timeout: number }) {
  return db.$transaction(async (tx) => {
    // The same company lock used for role changes makes authorization and writes atomic.
    await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${actor.organizationId}::uuid FOR UPDATE`;
    const current = await tx.membership.findUnique({ where: { organizationId_id: { organizationId: actor.organizationId, id: actor.id } }, include: { user: true, organization: true } });
    if (!current?.active || !current.user.active || !current.organization.active || !roles.includes(current.role)) return reject(403, 'FORBIDDEN', 'Current company role does not permit this action');
    return work(tx, current);
  }, options);
}

export async function audit(tx: Prisma.TransactionClient, actor: Membership, action: string, targetId: string, details: Prisma.InputJsonObject = {}) {
  await tx.auditEvent.create({ data: { organizationId: actor.organizationId, actorMembershipId: actor.id, action, targetId, details } });
}

export async function checkJobReferences(tx: Prisma.TransactionClient, organizationId: string, input: JobInput) {
  if (!validArrivalWindow(input)) return reject(400, 'INVALID_WINDOW', 'Arrival end must follow start, within seven days');
  const site = await tx.serviceSite.findFirst({ where: { organizationId, id: input.siteId, customerId: input.customerId } });
  const equipment = await tx.equipment.findFirst({ where: { organizationId, id: input.equipmentId, siteId: input.siteId } });
  if (!site || !equipment) return reject(404, 'NOT_FOUND', 'Customer, site or equipment not found');
}

export function createJobService(database: PrismaClient) {
  const event = async (tx: Prisma.TransactionClient, actor: Membership, jobId: string, kind: string, note: string, details: Prisma.InputJsonObject) => {
    await tx.jobEvent.create({ data: { organizationId: actor.organizationId, actorMembershipId: actor.id, jobId, kind, note, details } });
    await audit(tx, actor, kind, jobId, details);
  };
  return {
    create: (actor: Membership, input: JobInput) => intakeWrite(database, actor, async (tx) => {
      await checkJobReferences(tx, actor.organizationId, input);
      const job = await tx.job.create({ data: { organizationId: actor.organizationId, ...input } });
      await event(tx, actor, job.id, 'JOB_CREATED', 'Service request created as a draft.', { version: job.version });
      return job;
    }),
    update: (actor: Membership, id: string, version: number, input: JobInput) => intakeWrite(database, actor, async (tx) => {
      const job = await tx.job.findUnique({ where: { organizationId_id: { organizationId: actor.organizationId, id } } });
      if (!job) return reject(404, 'NOT_FOUND', 'Job not found');
      if (job.version !== version) return reject(409, 'VERSION_CONFLICT', 'This job changed. Reload it before saving');
      if (await tx.appointmentReservation.count({ where: { organizationId: actor.organizationId, jobId: id, active: true } })) return reject(409, 'ACTIVE_RESERVATIONS', 'Release the reservation before changing this job');
      if (!['DRAFT', 'TRIAGED', 'READY'].includes(job.status)) return reject(409, 'INVALID_TRANSITION', 'Assigned intake cannot be edited');
      await checkJobReferences(tx, actor.organizationId, input);
      const changedFields = Object.keys(input).filter((key) => {
        const field = key as keyof JobInput;
        const old = job[field];
        return String(old instanceof Date ? old.toISOString() : old) !== String(field === 'arrivalStart' || field === 'arrivalEnd' ? new Date(input[field]).toISOString() : input[field]);
      });
      const updated = await tx.job.update({ where: { organizationId_id: { organizationId: actor.organizationId, id }, version }, data: { ...input, status: job.status === 'READY' ? 'TRIAGED' : job.status, readySnapshot: Prisma.DbNull, warningAcknowledgments: {}, visitRevision: { increment: 1 }, version: { increment: 1 } } });
      await event(tx, actor, id, 'JOB_UPDATED', 'Draft intake details updated.', { version: updated.version, changedFields });
      return updated;
    }),
    transition: (actor: Membership, id: string, version: number, status: 'DRAFT' | 'TRIAGED', reason: string) => intakeWrite(database, actor, async (tx) => {
      const job = await tx.job.findUnique({ where: { organizationId_id: { organizationId: actor.organizationId, id } } });
      if (!job) return reject(404, 'NOT_FOUND', 'Job not found');
      if (job.version !== version) return reject(409, 'VERSION_CONFLICT', 'This job changed. Reload it before saving');
      if (await tx.appointmentReservation.count({ where: { organizationId: actor.organizationId, jobId: id, active: true } })) return reject(409, 'ACTIVE_RESERVATIONS', 'Release the reservation before changing this job');
      if (!['DRAFT', 'TRIAGED', 'READY'].includes(job.status)) return reject(409, 'INVALID_TRANSITION', 'Assigned jobs require a dedicated lifecycle action');
      if (job.status === status || (status === 'DRAFT' && !reason)) return reject(409, 'INVALID_TRANSITION', 'Choose a different state and give a reason when returning to draft');
      if (status === 'TRIAGED') await checkJobReferences(tx, actor.organizationId, { ...job, arrivalStart: job.arrivalStart.toISOString(), arrivalEnd: job.arrivalEnd.toISOString() });
      const updated = await tx.job.update({ where: { organizationId_id: { organizationId: actor.organizationId, id }, version }, data: { status, readySnapshot: Prisma.DbNull, warningAcknowledgments: {}, version: { increment: 1 } } });
      await event(tx, actor, id, 'JOB_STATE_CHANGED', reason || 'Intake checked and ready for scheduling.', { from: job.status, to: status, version: updated.version });
      return updated;
    }),
  };
}
