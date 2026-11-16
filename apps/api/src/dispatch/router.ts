import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { Prisma, type Job, type Membership, type PrismaClient } from '@prisma/client';
import { partInputSchema, stockLocationInputSchema, preparationInputSchema, jobPartInputSchema, partConfirmationInputSchema, prerequisiteInputSchema, prerequisiteEvidenceInputSchema, warningInputSchema, assignmentInputSchema, freshnessInputSchema } from '@servicegrid/contracts';
import { context } from '../auth/context.js';
import { reject } from '../auth/errors.js';
import { audit, intakeWrite } from '../intake/service.js';
import { approveAssignment, editableJob, json, preparationChanged, rankTechnicians, readiness } from './service.js';

const uuid = z.uuid();
function parse<T>(schema: z.ZodType<T>, value: unknown): T { const result = schema.safeParse(value); if (!result.success) return reject(400, 'INVALID_REQUEST', 'Check the required preparation fields and values'); return result.data; }
const pageSchema = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) }).strict();
const versionSchema = z.object({ version: z.number().int().positive() }).strict();
export function createDispatchRouter(db: PrismaClient, csrf: RequestHandler) {
  const router = Router();
  router.use(['/parts', '/stock-locations', '/dispatch-policy', '/preparation'], (req, res, next) => { if (!['OWNER', 'DISPATCHER'].includes(context(res).membership!.role)) return reject(403, 'FORBIDDEN', 'Dispatcher or owner access required'); if (req.method !== 'GET') return csrf(req, res, next); next(); });
  const mutate = (actor: Membership, jobId: string, version: number, action: string, work: (tx: Prisma.TransactionClient, job: Job) => Promise<Prisma.InputJsonObject>) => intakeWrite(db, actor, async (tx) => {
    const job = await editableJob(tx, actor.organizationId, jobId, version); const details = await work(tx, job);
    return { ...details, ...await preparationChanged(tx, actor, jobId, action, details) };
  });
  for (const resource of ['parts', 'stock-locations'] as const) {
    router.get(`/${resource}`, async (req, res) => {
      const { page, limit } = parse(pageSchema, req.query); const where = { organizationId: context(res).membership!.organizationId };
      const options = { where, skip: (page - 1) * limit, take: limit, orderBy: { id: 'asc' as const } };
      const [items, total] = resource === 'parts' ? await db.$transaction([db.part.findMany(options), db.part.count({ where })]) : await db.$transaction([db.stockLocation.findMany(options), db.stockLocation.count({ where })]); res.json({ items, total, page, limit });
    });
  }
  router.post('/parts', async (req, res) => {
    const input = parse(partInputSchema, req.body); const actor = context(res).membership!;
    res.status(201).json(await intakeWrite(db, actor, async (tx) => {
      const sku = input.sku.toUpperCase(); if (await tx.part.findUnique({ where: { organizationId_sku: { organizationId: actor.organizationId, sku } } })) return reject(409, 'DUPLICATE_SKU', 'This part SKU already exists');
      const row = await tx.part.create({ data: { ...input, sku, organizationId: actor.organizationId } }); await audit(tx, actor, 'PART_CREATED', row.id); return row;
    }));
  });
  router.post('/stock-locations', async (req, res) => {
    const input = parse(stockLocationInputSchema, req.body); const actor = context(res).membership!;
    res.status(201).json(await intakeWrite(db, actor, async (tx) => {
      const organizationId = actor.organizationId;
      if (!await tx.branch.findUnique({ where: { organizationId_id: { organizationId, id: input.branchId } } })) return reject(404, 'NOT_FOUND', 'Branch not found');
      if (await tx.stockLocation.findUnique({ where: { organizationId_branchId_name: { organizationId, branchId: input.branchId, name: input.name } } })) return reject(409, 'DUPLICATE_LOCATION', 'This location already exists');
      const row = await tx.stockLocation.create({ data: { ...input, organizationId } }); await audit(tx, actor, 'STOCK_LOCATION_CREATED', row.id); return row;
    }));
  });
  router.get('/dispatch-policy', async (_req, res) => { const row = await db.organization.findUniqueOrThrow({ where: { id: context(res).membership!.organizationId } }); res.json({ hours: row.partsFreshnessHours, policyVersion: row.preparationPolicyVersion }); });
  router.put('/dispatch-policy', async (req, res) => {
    const input = parse(freshnessInputSchema, req.body); const actor = context(res).membership!;
    res.json(await intakeWrite(db, actor, async (tx) => {
      const member = await tx.membership.findUniqueOrThrow({ where: { id: actor.id } }); if (member.role !== 'OWNER') return reject(403, 'FORBIDDEN', 'Owner access required');
      const current = await tx.organization.findUniqueOrThrow({ where: { id: actor.organizationId } }); if (current.preparationPolicyVersion !== input.policyVersion) return reject(409, 'VERSION_CONFLICT', 'Policy changed. Reload before saving');
      const updated = await tx.organization.update({ where: { id: actor.organizationId }, data: { partsFreshnessHours: input.hours, preparationPolicyVersion: { increment: 1 } } }); await audit(tx, actor, 'PARTS_FRESHNESS_POLICY_UPDATED', actor.organizationId, { hours: input.hours, policyVersion: updated.preparationPolicyVersion }); return { hours: updated.partsFreshnessHours, policyVersion: updated.preparationPolicyVersion };
    }));
  });
  router.get('/preparation/:jobId', async (req, res) => {
    const jobId = parse(uuid, req.params.jobId); const organizationId = context(res).membership!.organizationId;
    const { job } = await db.$transaction((tx) => readiness(tx, organizationId, jobId), { isolationLevel: 'RepeatableRead' });
    res.json({ jobVersion: job.version, plannedStart: job.plannedStart, partsReviewed: job.partsReviewed, prerequisitesReviewed: job.prerequisitesReviewed, partsFreshnessHours: job.organization.partsFreshnessHours, policyVersion: job.organization.preparationPolicyVersion,
      parts: job.partRequirements.map(({ confirmations, ...row }) => ({ ...row, latest: confirmations[0] ? { ...confirmations[0], verifierName: confirmations[0].actor.user.name } : null })), prerequisites: job.prerequisites.map(({ evidence, ...row }) => ({ ...row, latest: evidence[0] ? { ...evidence[0], verifierName: evidence[0].actor.user.name } : null })) });
  });
  router.put('/preparation/:jobId', async (req, res) => {
    const jobId = parse(uuid, req.params.jobId); const input = parse(preparationInputSchema, req.body); const actor = context(res).membership!;
    res.json(await mutate(actor, jobId, input.version, 'PREPARATION_PLAN_UPDATED', async (tx, job) => {
      const plannedStart = new Date(input.plannedStart); if (plannedStart < job.arrivalStart || plannedStart >= job.arrivalEnd) return reject(400, 'OUTSIDE_ARRIVAL_WINDOW', 'Proposed arrival must be inside the customer window');
      await tx.job.update({ where: { id: jobId }, data: { plannedStart, partsReviewed: input.partsReviewed, prerequisitesReviewed: input.prerequisitesReviewed, ...(plannedStart.getTime() !== job.plannedStart?.getTime() ? { visitRevision: { increment: 1 } } : {}) } });
      return { plannedStart: plannedStart.toISOString(), partsReviewed: input.partsReviewed, prerequisitesReviewed: input.prerequisitesReviewed };
    }));
  });
  router.post('/preparation/:jobId/parts', async (req, res) => {
    const jobId = parse(uuid, req.params.jobId); const input = parse(jobPartInputSchema, req.body); const actor = context(res).membership!;
    res.status(201).json(await mutate(actor, jobId, input.version, 'JOB_PART_CREATED', async (tx) => {
      const organizationId = actor.organizationId;
      if (!await tx.part.findUnique({ where: { organizationId_id: { organizationId, id: input.partId } } }) || !await tx.stockLocation.findUnique({ where: { organizationId_id: { organizationId, id: input.locationId } } })) return reject(404, 'NOT_FOUND', 'Part or stock location not found');
      if (await tx.jobPart.findUnique({ where: { organizationId_jobId_partId_locationId: { organizationId, jobId, partId: input.partId, locationId: input.locationId } } })) return reject(409, 'DUPLICATE_REQUIREMENT', 'Update the existing part requirement for this location');
      const { version: _version, ...fields } = input; void _version;
      const row = await tx.jobPart.create({ data: { ...fields, organizationId, jobId } }); return { id: row.id, reason: input.reason, state: input.state, partId: input.partId, locationId: input.locationId, quantity: input.quantity };
    }));
  });
  router.put('/preparation/:jobId/parts/:partId', async (req, res) => {
    const jobId = parse(uuid, req.params.jobId); const id = parse(uuid, req.params.partId); const input = parse(jobPartInputSchema, req.body); const actor = context(res).membership!;
    res.json(await mutate(actor, jobId, input.version, 'JOB_PART_UPDATED', async (tx) => {
      const organizationId = actor.organizationId; const row = await tx.jobPart.findFirst({ where: { organizationId, jobId, id } }); if (!row) return reject(404, 'NOT_FOUND', 'Part requirement not found');
      if (!await tx.part.findUnique({ where: { organizationId_id: { organizationId, id: input.partId } } }) || !await tx.stockLocation.findUnique({ where: { organizationId_id: { organizationId, id: input.locationId } } })) return reject(404, 'NOT_FOUND', 'Part or location not found');
      if (await tx.jobPart.findFirst({ where: { organizationId, jobId, partId: input.partId, locationId: input.locationId, id: { not: id } } })) return reject(409, 'DUPLICATE_REQUIREMENT', 'Another requirement already uses that part and location');
      const { version: _version, ...fields } = input; void _version;
      await tx.jobPart.update({ where: { id }, data: { ...fields, revision: { increment: 1 } } }); return { id, previousState: row.state, state: input.state, reason: input.reason, partId: input.partId, locationId: input.locationId, quantity: input.quantity, before: { partId: row.partId, locationId: row.locationId, quantity: row.quantity.toString() } };
    }));
  });
  router.post('/preparation/:jobId/parts/:partId/confirmations', async (req, res) => {
    const jobId = parse(uuid, req.params.jobId); const id = parse(uuid, req.params.partId); const input = parse(partConfirmationInputSchema, req.body); const actor = context(res).membership!;
    res.status(201).json(await mutate(actor, jobId, input.version, 'PART_AVAILABILITY_RECORDED', async (tx, job) => {
      const organizationId = actor.organizationId; const row = await tx.jobPart.findFirst({ where: { organizationId, jobId, id } }); if (!row) return reject(404, 'NOT_FOUND', 'Part requirement not found'); if (!job.plannedStart) return reject(409, 'APPOINTMENT_REQUIRED', 'Save a proposed arrival before confirming evidence');
      const evidence = await tx.partConfirmation.create({ data: { organizationId, jobPartId: id, recordedJobVersion: job.version + 1, requirementRevision: row.revision, visitRevision: job.visitRevision, plannedStart: job.plannedStart, confirmedByMembershipId: actor.id, status: input.status, note: input.note } }); return { evidenceId: evidence.id, status: input.status, note: input.note };
    }));
  });
  router.post('/preparation/:jobId/prerequisites', async (req, res) => {
    const jobId = parse(uuid, req.params.jobId); const input = parse(prerequisiteInputSchema, req.body); const actor = context(res).membership!;
    res.status(201).json(await mutate(actor, jobId, input.version, 'PREREQUISITE_CREATED', async (tx) => {
      const organizationId = actor.organizationId; if (await tx.jobPrerequisite.findUnique({ where: { organizationId_jobId_code: { organizationId, jobId, code: input.code } } })) return reject(409, 'DUPLICATE_PREREQUISITE', 'That prerequisite code already exists');
      const { version: _version, ...fields } = input; void _version; const row = await tx.jobPrerequisite.create({ data: { ...fields, organizationId, jobId } }); return { id: row.id, ...fields };
    }));
  });
  router.post('/preparation/:jobId/prerequisites/:prerequisiteId/evidence', async (req, res) => {
    const jobId = parse(uuid, req.params.jobId); const id = parse(uuid, req.params.prerequisiteId); const input = parse(prerequisiteEvidenceInputSchema, req.body); const actor = context(res).membership!;
    res.status(201).json(await mutate(actor, jobId, input.version, 'PREREQUISITE_EVIDENCE_RECORDED', async (tx, job) => {
      const organizationId = actor.organizationId; if (!await tx.jobPrerequisite.findFirst({ where: { organizationId, jobId, id } })) return reject(404, 'NOT_FOUND', 'Prerequisite not found'); if (!job.plannedStart) return reject(409, 'APPOINTMENT_REQUIRED', 'Save a proposed arrival before recording evidence');
      const evidence = await tx.prerequisiteEvidence.create({ data: { organizationId, prerequisiteId: id, recordedJobVersion: job.version + 1, visitRevision: job.visitRevision, plannedStart: job.plannedStart, verifiedByMembershipId: actor.id, status: input.status, note: input.note } }); return { evidenceId: evidence.id, status: input.status, note: input.note };
    }));
  });
  router.get('/preparation/:jobId/readiness', async (req, res) => { const jobId = parse(uuid, req.params.jobId); res.json(await db.$transaction(async (tx) => (await readiness(tx, context(res).membership!.organizationId, jobId)).result, { isolationLevel: 'RepeatableRead' })); });
  router.post('/preparation/:jobId/warnings', async (req, res) => {
    const jobId = parse(uuid, req.params.jobId); const input = parse(warningInputSchema, req.body); const actor = context(res).membership!;
    res.json(await intakeWrite(db, actor, async (tx) => {
      const job = await editableJob(tx, actor.organizationId, jobId, input.version); const current = await readiness(tx, actor.organizationId, jobId);
      if (!current.result.checks.some((item) => item.code === input.code && item.severity === 'WARNING' && item.status !== 'PASS')) return reject(400, 'NOT_A_WARNING', 'Only a current warning can be acknowledged; blockers cannot be overridden');
      const updated = await tx.job.update({ where: { id: jobId }, data: { status: job.status === 'READY' ? 'TRIAGED' : job.status, readySnapshot: Prisma.DbNull, warningAcknowledgments: { ...job.warningAcknowledgments as Prisma.InputJsonObject, [input.code]: { reason: input.reason, actorMembershipId: actor.id, recordedAt: new Date().toISOString() } }, version: { increment: 1 } } });
      await tx.jobEvent.create({ data: { organizationId: actor.organizationId, jobId, actorMembershipId: actor.id, kind: 'READINESS_WARNING_ACKNOWLEDGED', note: input.reason, details: { code: input.code, version: updated.version } } });
      await audit(tx, actor, 'READINESS_WARNING_ACKNOWLEDGED', jobId, { code: input.code, reason: input.reason, version: updated.version }); return { jobVersion: updated.version };
    }));
  });
  router.post('/preparation/:jobId/ready', async (req, res) => {
    const jobId = parse(uuid, req.params.jobId); const input = parse(versionSchema, req.body); const actor = context(res).membership!;
    res.json(await intakeWrite(db, actor, async (tx) => {
      await editableJob(tx, actor.organizationId, jobId, input.version); const current = await readiness(tx, actor.organizationId, jobId);
      if (current.result.status !== 'READY') return reject(422, 'READINESS_BLOCKED', 'Resolve blockers and acknowledge warnings before marking ready');
      const updated = await tx.job.update({ where: { id: jobId }, data: { status: 'READY', readySnapshot: json({ ...current.result, jobVersion: current.job.version + 1 }), version: { increment: 1 } } });
      await tx.jobEvent.create({ data: { organizationId: actor.organizationId, jobId, actorMembershipId: actor.id, kind: 'JOB_MARKED_READY', note: 'Current preparation checks approved.', details: { version: updated.version, policyVersion: current.result.policyVersion } } }); await audit(tx, actor, 'JOB_MARKED_READY', jobId, { version: updated.version, policyVersion: current.result.policyVersion }); return { jobVersion: updated.version };
    }));
  });
  router.post('/preparation/:jobId/ranking', async (req, res) => { const jobId = parse(uuid, req.params.jobId); const { version } = parse(versionSchema, req.body); res.json(await db.$transaction((tx) => rankTechnicians(tx, context(res).membership!.organizationId, jobId, version), { isolationLevel: 'RepeatableRead' })); });
  router.post('/preparation/:jobId/assignments', async (req, res) => {
    const jobId = parse(uuid, req.params.jobId); const input = parse(assignmentInputSchema, req.body); const key = parse(z.string().regex(/^[A-Za-z0-9_-]{16,100}$/), req.get('Idempotency-Key'));
    res.status(201).json(await approveAssignment(db, context(res).membership!, jobId, input, key));
  });
  router.get('/preparation/:jobId/assignment', async (req, res) => {
    const jobId = parse(uuid, req.params.jobId); const organizationId = context(res).membership!.organizationId;
    if (!await db.job.findUnique({ where: { organizationId_id: { organizationId, id: jobId } } })) return reject(404, 'NOT_FOUND', 'Job not found');
    const row = await db.assignment.findFirst({ where: { organizationId, jobId, active: true }, include: { technician: { include: { membership: { include: { user: true } } } }, approver: { include: { user: true } }, reservation: true } });
    res.json({ assignment: row ? { id: row.id, technicianId: row.technicianId, technicianName: row.technician.membership.user.name, approvedByName: row.approver.user.name, approvedAt: row.approvedAt, approvalReason: row.approvalReason, active: row.active, reservedFrom: row.reservation.reservedFrom, plannedStart: row.reservation.plannedStart, endsAt: row.reservation.endsAt } : null });
  });
  return router;
}
