import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { Prisma, type PrismaClient, type Membership } from '@prisma/client';
import { branchInputSchema, skillInputSchema, technicianInputSchema, technicianUpdateSchema, verifiedSkillInputSchema, availabilityInputSchema, schedulingInputSchema, eligibilityInputSchema } from '@servicegrid/contracts';
import { context } from '../auth/context.js';
import { reject } from '../auth/errors.js';
import { audit, intakeWrite } from '../intake/service.js';
import { eligibility, lockTechnician } from './service.js';
import { overlaps } from './policy.js';

function parse<T>(schema: z.ZodType<T>, input: unknown): T { const value = schema.safeParse(input); if (!value.success) return reject(400, 'INVALID_REQUEST', 'Check the required scheduling fields and values'); return value.data; }
const pageQuery = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) }).strict();
const uuid = z.uuid();
function ownerWrite<T>(db: PrismaClient, actor: Membership, work: (tx: Prisma.TransactionClient) => Promise<T>) {
  return intakeWrite(db, actor, async (tx) => {
    const member = await tx.membership.findUnique({ where: { organizationId_id: { organizationId: actor.organizationId, id: actor.id } } });
    if (member?.role !== 'OWNER') return reject(403, 'FORBIDDEN', 'Owner access required');
    return work(tx);
  });
}
export function createSchedulingRouter(db: PrismaClient, csrf: RequestHandler) {
  const router = Router();
  router.use(['/branches', '/skills', '/technicians', '/technician-memberships', '/job-scheduling'], (req, res, next) => {
    if (!['OWNER', 'DISPATCHER'].includes(context(res).membership!.role)) return reject(403, 'FORBIDDEN', 'Dispatcher or owner access required');
    if (req.method !== 'GET') return csrf(req, res, next); next();
  });
  const owner: RequestHandler = (_req, res, next) => { if (context(res).membership!.role !== 'OWNER') return reject(403, 'FORBIDDEN', 'Owner access required to manage verified technician records'); next(); };
  for (const resource of ['branches', 'skills'] as const) {
    router.get(`/${resource}`, async (req, res) => {
      const { page, limit } = parse(pageQuery, req.query); const organizationId = context(res).membership!.organizationId;
      const options = { where: { organizationId }, orderBy: { name: 'asc' as const }, skip: (page - 1) * limit, take: limit };
      const [items, total] = resource === 'branches' ? await db.$transaction([db.branch.findMany(options), db.branch.count({ where: { organizationId } })]) : await db.$transaction([db.skill.findMany(options), db.skill.count({ where: { organizationId } })]);
      res.json({ items, total, page, limit });
    });
    router.post(`/${resource}`, owner, async (req, res) => {
      const input = resource === 'branches' ? parse(branchInputSchema, req.body) : parse(skillInputSchema, req.body); const actor = context(res).membership!;
      const item = await ownerWrite(db, actor, async (tx) => {
        const nameKey = input.name.toLowerCase();
        const existing = resource === 'branches' ? await tx.branch.findUnique({ where: { organizationId_nameKey: { organizationId: actor.organizationId, nameKey } } }) : await tx.skill.findUnique({ where: { organizationId_nameKey: { organizationId: actor.organizationId, nameKey } } });
        if (existing) return reject(409, 'DUPLICATE_NAME', 'That name already exists in this company');
        const row = resource === 'branches' ? await tx.branch.create({ data: { organizationId: actor.organizationId, name: input.name, nameKey, address: 'address' in input ? String(input.address) : '' } }) : await tx.skill.create({ data: { organizationId: actor.organizationId, name: input.name, nameKey } });
        await audit(tx, actor, resource === 'branches' ? 'BRANCH_CREATED' : 'SKILL_CREATED', row.id); return row;
      }); res.status(201).json(item);
    });
  }
  router.get('/technician-memberships', owner, async (req, res) => {
    const { page, limit } = parse(pageQuery, req.query); const where = { organizationId: context(res).membership!.organizationId, role: 'TECHNICIAN' as const, active: true, user: { active: true }, technician: null };
    const [rows, total] = await db.$transaction([db.membership.findMany({ where, include: { user: true }, orderBy: { id: 'asc' }, skip: (page - 1) * limit, take: limit }), db.membership.count({ where })]);
    res.json({ items: rows.map((row) => ({ id: row.id, name: row.user.name, email: row.user.email })), page, limit, total });
  });
  router.get('/technicians', async (req, res) => {
    const { page, limit } = parse(pageQuery, req.query); const organizationId = context(res).membership!.organizationId;
    const [rows, total] = await db.$transaction([db.technician.findMany({ where: { organizationId }, include: { membership: { include: { user: true } }, skills: { include: { skill: true, verifier: { include: { user: true } } } }, availability: { orderBy: { startsAt: 'asc' } } }, orderBy: { id: 'asc' }, skip: (page - 1) * limit, take: limit }), db.technician.count({ where: { organizationId } })]);
    res.json({ items: rows.map(({ membership, skills, ...row }) => ({ ...row, name: membership.user.name, email: membership.user.email, membershipActive: membership.active && membership.user.active && membership.role === 'TECHNICIAN', skills: skills.map(({ skill, verifier, ...item }) => ({ ...item, name: skill.name, verifierName: verifier.user.name })) })), total, page, limit });
  });
  router.post('/technicians', owner, async (req, res) => {
    const input = parse(technicianInputSchema, req.body); const actor = context(res).membership!;
    const item = await ownerWrite(db, actor, async (tx) => {
      const member = await tx.membership.findFirst({ where: { organizationId: actor.organizationId, id: input.membershipId, role: 'TECHNICIAN', active: true, user: { active: true } } });
      if (!member || !await tx.branch.findUnique({ where: { organizationId_id: { organizationId: actor.organizationId, id: input.branchId } } })) return reject(404, 'NOT_FOUND', 'Technician membership or branch not found');
      if (await tx.technician.findUnique({ where: { membershipId: member.id } })) return reject(409, 'PROFILE_EXISTS', 'That membership already has a technician profile');
      const row = await tx.technician.create({ data: { ...input, organizationId: actor.organizationId } }); await audit(tx, actor, 'TECHNICIAN_CREATED', row.id); return row;
    }); res.status(201).json(item);
  });
  router.patch('/technicians/:id', owner, async (req, res) => {
    const id = parse(uuid, req.params.id); const input = parse(technicianUpdateSchema, req.body); const actor = context(res).membership!;
    res.json(await ownerWrite(db, actor, async (tx) => {
      await lockTechnician(tx, actor.organizationId, id);
      const row = await tx.technician.findUniqueOrThrow({ where: { organizationId_id: { organizationId: actor.organizationId, id } } });
      if (row.version !== input.version) return reject(409, 'VERSION_CONFLICT', 'Technician changed. Reload before saving');
      if (!await tx.branch.findUnique({ where: { organizationId_id: { organizationId: actor.organizationId, id: input.branchId } } })) return reject(404, 'NOT_FOUND', 'Branch not found');
      if ((!input.active || input.safetyRestricted || row.branchId !== input.branchId) && await tx.appointmentReservation.count({ where: { organizationId: actor.organizationId, technicianId: id, active: true, endsAt: { gt: new Date() } } })) return reject(409, 'ACTIVE_RESERVATIONS', 'Release future reservations before changing this profile');
      const updated = await tx.technician.update({ where: { id }, data: { ...input, version: { increment: 1 } } }); await audit(tx, actor, 'TECHNICIAN_UPDATED', id, { version: updated.version, before: { branchId: row.branchId, active: row.active, safetyRestricted: row.safetyRestricted }, after: { branchId: input.branchId, active: input.active, safetyRestricted: input.safetyRestricted } }); return updated;
    }));
  });
  router.put('/technicians/:id/skills/:skillId', owner, async (req, res) => {
    const id = parse(uuid, req.params.id); const skillId = parse(uuid, req.params.skillId); const input = parse(verifiedSkillInputSchema, req.body); const actor = context(res).membership!;
    res.json(await ownerWrite(db, actor, async (tx) => {
      await lockTechnician(tx, actor.organizationId, id);
      const tech = await tx.technician.findUniqueOrThrow({ where: { id } }); if (tech.version !== input.version) return reject(409, 'VERSION_CONFLICT', 'Technician changed. Reload before verifying');
      if (!await tx.skill.findUnique({ where: { organizationId_id: { organizationId: actor.organizationId, id: skillId } } })) return reject(404, 'NOT_FOUND', 'Skill not found');
      const future = await tx.appointmentReservation.findMany({ where: { organizationId: actor.organizationId, technicianId: id, active: true, endsAt: { gt: new Date() } }, include: { job: { include: { scheduling: { include: { requirements: { where: { skillId } } } } } } } });
      if (future.some((booking) => booking.job.scheduling?.requirements.some((required) => !input.active || input.level < required.level || (!!input.expiresAt && (new Date(input.expiresAt) <= new Date() || new Date(input.expiresAt) < booking.endsAt))))) return reject(409, 'ACTIVE_RESERVATIONS', 'This qualification change would invalidate an active reservation');
      const { version: _version, ...fields } = input; void _version;
      await tx.technicianSkill.upsert({ where: { organizationId_technicianId_skillId: { organizationId: actor.organizationId, technicianId: id, skillId } }, create: { ...fields, organizationId: actor.organizationId, technicianId: id, skillId, verifiedByMembershipId: actor.id }, update: { ...fields, verifiedByMembershipId: actor.id, verifiedAt: new Date() } });
      const updated = await tx.technician.update({ where: { id }, data: { version: { increment: 1 } } }); await audit(tx, actor, 'TECHNICIAN_SKILL_VERIFIED', id, { skillId, active: input.active, level: input.level, expiresAt: input.expiresAt, evidence: input.evidence, version: updated.version }); return { version: updated.version };
    }));
  });
  router.post('/technicians/:id/availability', async (req, res) => {
    const id = parse(uuid, req.params.id); const input = parse(availabilityInputSchema, req.body); const actor = context(res).membership!;
    const start = new Date(input.startsAt); const end = new Date(input.endsAt);
    if (end <= start || end.getTime() - start.getTime() > 7 * 86400_000) return reject(400, 'INVALID_INTERVAL', 'Availability must be a positive interval no longer than seven days');
    const item = await intakeWrite(db, actor, async (tx) => {
      await lockTechnician(tx, actor.organizationId, id); const tech = await tx.technician.findUniqueOrThrow({ where: { id } });
      if (tech.version !== input.version) return reject(409, 'VERSION_CONFLICT', 'Technician changed. Reload before saving availability');
      if (await tx.availability.count({ where: { organizationId: actor.organizationId, technicianId: id, kind: input.kind, startsAt: { lt: end }, endsAt: { gt: start } } })) return reject(409, 'INTERVAL_OVERLAP', 'An interval of that type already overlaps');
      if (input.kind === 'UNAVAILABLE' && await tx.appointmentReservation.count({ where: { organizationId: actor.organizationId, technicianId: id, active: true, reservedFrom: { lt: end }, endsAt: { gt: start } } })) return reject(409, 'ACTIVE_RESERVATIONS', 'Unavailability overlaps an active reservation');
      const row = await tx.availability.create({ data: { organizationId: actor.organizationId, technicianId: id, kind: input.kind, startsAt: start, endsAt: end, reason: input.reason } });
      await tx.technician.update({ where: { id }, data: { version: { increment: 1 } } }); await audit(tx, actor, 'AVAILABILITY_CREATED', row.id, { technicianId: id, kind: input.kind, startsAt: start.toISOString(), endsAt: end.toISOString(), reason: input.reason }); return row;
    }); res.status(201).json(item);
  });
  router.delete('/technicians/:id/availability/:blockId', async (req, res) => {
    const id = parse(uuid, req.params.id); const blockId = parse(uuid, req.params.blockId); const { version } = parse(z.object({ version: z.number().int().positive() }).strict(), req.body); const actor = context(res).membership!;
    await intakeWrite(db, actor, async (tx) => {
      await lockTechnician(tx, actor.organizationId, id); const tech = await tx.technician.findUniqueOrThrow({ where: { id } });
      if (tech.version !== version) return reject(409, 'VERSION_CONFLICT', 'Technician changed. Reload before removing availability');
      const block = await tx.availability.findFirst({ where: { organizationId: actor.organizationId, technicianId: id, id: blockId } }); if (!block) return reject(404, 'NOT_FOUND', 'Availability not found');
      if (block.kind === 'SHIFT') {
        const bookings = await tx.appointmentReservation.findMany({ where: { organizationId: actor.organizationId, technicianId: id, active: true, reservedFrom: { lt: block.endsAt }, endsAt: { gt: block.startsAt } } });
        const others = await tx.availability.findMany({ where: { organizationId: actor.organizationId, technicianId: id, kind: 'SHIFT', id: { not: blockId } } });
        if (bookings.some((booking) => overlaps({ startsAt: booking.reservedFrom, endsAt: booking.endsAt }, block) && !others.some((shift) => shift.startsAt <= booking.reservedFrom && shift.endsAt >= booking.endsAt))) return reject(409, 'ACTIVE_RESERVATIONS', 'This shift covers an active reservation');
      }
      await tx.availability.delete({ where: { id: blockId } }); await tx.technician.update({ where: { id }, data: { version: { increment: 1 } } }); await audit(tx, actor, 'AVAILABILITY_REMOVED', blockId, { technicianId: id, kind: block.kind, startsAt: block.startsAt.toISOString(), endsAt: block.endsAt.toISOString(), reason: block.reason });
    }); res.json({ removed: true });
  });
  router.get('/job-scheduling/:jobId', async (req, res) => {
    const jobId = parse(uuid, req.params.jobId); const organizationId = context(res).membership!.organizationId;
    const job = await db.job.findUnique({ where: { organizationId_id: { organizationId, id: jobId } }, include: { scheduling: { include: { requirements: true } } } });
    if (!job) return reject(404, 'NOT_FOUND', 'Job not found'); res.json({ policy: job.scheduling ? { ...job.scheduling, jobVersion: job.version } : null, jobVersion: job.version });
  });
  router.put('/job-scheduling/:jobId', async (req, res) => {
    const jobId = parse(uuid, req.params.jobId); const input = parse(schedulingInputSchema, req.body); const actor = context(res).membership!;
    if ((input.generalInspection && input.requirements.length > 0) || (!input.generalInspection && input.requirements.length === 0) || new Set(input.requirements.map((item) => item.skillId)).size !== input.requirements.length) return reject(400, 'INVALID_REQUIREMENTS', 'Choose explicit general inspection or distinct required skills');
    res.json(await intakeWrite(db, actor, async (tx) => {
      const organizationId = actor.organizationId; const job = await tx.job.findUnique({ where: { organizationId_id: { organizationId, id: jobId } } });
      if (!job) return reject(404, 'NOT_FOUND', 'Job not found'); if (job.version !== input.version) return reject(409, 'VERSION_CONFLICT', 'Job changed. Reload before changing requirements');
      if (await tx.appointmentReservation.count({ where: { organizationId, jobId, active: true } })) return reject(409, 'ACTIVE_RESERVATIONS', 'Release the reservation before changing scheduling requirements');
      if (!await tx.branch.findUnique({ where: { organizationId_id: { organizationId, id: input.branchId } } }) || await tx.skill.count({ where: { organizationId, id: { in: input.requirements.map((item) => item.skillId) } } }) !== input.requirements.length) return reject(404, 'NOT_FOUND', 'Branch or required skill not found');
      const fields = { branchId: input.branchId, allowCrossBranch: input.allowCrossBranch, generalInspection: input.generalInspection };
      const policy = await tx.jobScheduling.upsert({ where: { organizationId_jobId: { organizationId, jobId } }, create: { organizationId, jobId, ...fields }, update: fields });
      await tx.jobSkillRequirement.deleteMany({ where: { organizationId, schedulingId: policy.id } });
      await tx.jobSkillRequirement.createMany({ data: input.requirements.map((item) => ({ ...item, organizationId, schedulingId: policy.id })) });
      const updated = await tx.job.update({ where: { id: jobId }, data: { version: { increment: 1 }, status: job.status === 'READY' ? 'TRIAGED' : job.status, readySnapshot: Prisma.DbNull, warningAcknowledgments: {} } });
      await tx.jobEvent.create({ data: { organizationId, jobId, actorMembershipId: actor.id, kind: 'SCHEDULING_POLICY_UPDATED', note: input.generalInspection ? 'General inspection explicitly selected; branch policy updated.' : 'Required skills and branch policy updated.', details: { version: updated.version } } });
      await audit(tx, actor, 'SCHEDULING_POLICY_UPDATED', jobId, { version: updated.version, ...fields, requirements: input.requirements }); return { jobVersion: updated.version };
    }));
  });
  router.post('/job-scheduling/:jobId/eligibility', async (req, res) => {
    const jobId = parse(uuid, req.params.jobId); const input = parse(eligibilityInputSchema, req.body); const organizationId = context(res).membership!.organizationId;
    res.json(await db.$transaction((tx) => eligibility(tx, organizationId, jobId, input.version, new Date(input.plannedStart)), { isolationLevel: 'RepeatableRead' }));
  });
  return router;
}
