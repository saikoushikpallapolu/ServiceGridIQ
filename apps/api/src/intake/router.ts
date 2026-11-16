import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Prisma, PrismaClient } from '@prisma/client';
import { customerInputSchema, siteInputSchema, equipmentInputSchema, jobInputSchema, jobUpdateSchema, jobTransitionSchema, jobPrioritySchema, jobStatusSchema } from '@servicegrid/contracts';
import { context } from '../auth/context.js';
import { reject } from '../auth/errors.js';
import { audit, createJobService, intakeWrite } from './service.js';

const version = z.number().int().positive();
const querySchema = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1), limit: z.coerce.number().int().min(1).max(100).default(25), q: z.string().trim().max(160).optional(), status: jobStatusSchema.optional(), priority: jobPrioritySchema.optional(), customerId: z.uuid().optional(), siteId: z.uuid().optional() }).strict();
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const value = schema.safeParse(input);
  if (!value.success) return reject(400, 'INVALID_REQUEST', 'Check the required fields, values and lengths');
  return value.data;
}
const summary = (row: Prisma.JobGetPayload<{ include: { site: { include: { customer: true } }; equipment: true } }>) => ({ ...row, customerName: row.site.customer.name, siteName: row.site.name, equipmentLabel: `${row.equipment.manufacturer} ${row.equipment.model} · ${row.equipment.serialNumber}` });
const jobInclude = { site: { include: { customer: true } }, equipment: true } as const;

export function createIntakeRouter(database: PrismaClient, csrf: RequestHandler) {
  const router = Router();
  const jobs = createJobService(database);
  // Phase 3 has no technician assignment scope yet. Never expose the company queue to technicians.
  router.use(['/customers', '/sites', '/equipment', '/jobs'], (req, res, next) => {
    if (!['OWNER', 'DISPATCHER'].includes(context(res).membership!.role)) return reject(403, 'FORBIDDEN', 'Dispatcher or owner access required');
    if (['POST', 'PATCH', 'DELETE', 'PUT'].includes(req.method)) return csrf(req, res, next);
    next();
  });
  router.get('/customers', async (req, res) => {
    const { page, limit, q } = parse(querySchema, req.query);
    const where = { organizationId: context(res).membership!.organizationId, ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}) };
    const [items, total] = await database.$transaction([database.customer.findMany({ where, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: (page - 1) * limit, take: limit }), database.customer.count({ where })]);
    res.json({ items, total, page, limit });
  });
  router.post('/customers', async (req, res) => {
    const input = parse(customerInputSchema, req.body); const actor = context(res).membership!;
    const item = await intakeWrite(database, actor, async (tx) => {
      const row = await tx.customer.create({ data: { ...input, organizationId: actor.organizationId } });
      await audit(tx, actor, 'CUSTOMER_CREATED', row.id); return row;
    });
    res.status(201).json(item);
  });
  router.patch('/customers/:id', async (req, res) => {
    const id = parse(z.uuid(), req.params.id); const { version: expected, ...input } = parse(customerInputSchema.extend({ version }), req.body); const actor = context(res).membership!;
    res.json(await intakeWrite(database, actor, async (tx) => {
      const row = await tx.customer.findUnique({ where: { organizationId_id: { organizationId: actor.organizationId, id } } });
      if (!row) return reject(404, 'NOT_FOUND', 'Customer not found');
      if (row.version !== expected) return reject(409, 'VERSION_CONFLICT', 'This customer changed. Reload before saving');
      const updated = await tx.customer.update({ where: { organizationId_id: { organizationId: actor.organizationId, id }, version: expected }, data: { ...input, version: { increment: 1 } } });
      await audit(tx, actor, 'CUSTOMER_UPDATED', id, { version: updated.version }); return updated;
    }));
  });
  router.get('/sites', async (req, res) => {
    const { page, limit, customerId } = parse(querySchema, req.query);
    const where = { organizationId: context(res).membership!.organizationId, ...(customerId ? { customerId } : {}) };
    const [items, total] = await database.$transaction([database.serviceSite.findMany({ where, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: (page - 1) * limit, take: limit }), database.serviceSite.count({ where })]);
    res.json({ items, total, page, limit });
  });
  router.post('/sites', async (req, res) => {
    const input = parse(siteInputSchema, req.body); const actor = context(res).membership!;
    const item = await intakeWrite(database, actor, async (tx) => {
      if (!await tx.customer.findUnique({ where: { organizationId_id: { organizationId: actor.organizationId, id: input.customerId } } })) return reject(404, 'NOT_FOUND', 'Customer not found');
      const row = await tx.serviceSite.create({ data: { ...input, organizationId: actor.organizationId } });
      await audit(tx, actor, 'SITE_CREATED', row.id); return row;
    }); res.status(201).json(item);
  });
  router.patch('/sites/:id', async (req, res) => {
    const id = parse(z.uuid(), req.params.id); const { version: expected, ...input } = parse(siteInputSchema.omit({ customerId: true }).extend({ version }), req.body); const actor = context(res).membership!;
    res.json(await intakeWrite(database, actor, async (tx) => {
      const row = await tx.serviceSite.findUnique({ where: { organizationId_id: { organizationId: actor.organizationId, id } } });
      if (!row) return reject(404, 'NOT_FOUND', 'Site not found');
      if (row.version !== expected) return reject(409, 'VERSION_CONFLICT', 'This site changed. Reload before saving');
      const updated = await tx.serviceSite.update({ where: { organizationId_id: { organizationId: actor.organizationId, id }, version: expected }, data: { ...input, version: { increment: 1 } } });
      await audit(tx, actor, 'SITE_UPDATED', id, { version: updated.version }); return updated;
    }));
  });
  router.get('/equipment', async (req, res) => {
    const { page, limit, siteId } = parse(querySchema, req.query);
    const where = { organizationId: context(res).membership!.organizationId, ...(siteId ? { siteId } : {}) };
    const [items, total] = await database.$transaction([database.equipment.findMany({ where, orderBy: [{ manufacturer: 'asc' }, { model: 'asc' }, { id: 'asc' }], skip: (page - 1) * limit, take: limit }), database.equipment.count({ where })]);
    res.json({ items, total, page, limit });
  });
  router.post('/equipment', async (req, res) => {
    const input = parse(equipmentInputSchema, req.body); const actor = context(res).membership!;
    const item = await intakeWrite(database, actor, async (tx) => {
      if (!await tx.serviceSite.findUnique({ where: { organizationId_id: { organizationId: actor.organizationId, id: input.siteId } } })) return reject(404, 'NOT_FOUND', 'Site not found');
      const row = await tx.equipment.create({ data: { ...input, organizationId: actor.organizationId } });
      await audit(tx, actor, 'EQUIPMENT_CREATED', row.id); return row;
    }); res.status(201).json(item);
  });
  router.patch('/equipment/:id', async (req, res) => {
    const id = parse(z.uuid(), req.params.id); const { version: expected, ...input } = parse(equipmentInputSchema.omit({ siteId: true }).extend({ version }), req.body); const actor = context(res).membership!;
    res.json(await intakeWrite(database, actor, async (tx) => {
      const row = await tx.equipment.findUnique({ where: { organizationId_id: { organizationId: actor.organizationId, id } } });
      if (!row) return reject(404, 'NOT_FOUND', 'Equipment not found');
      if (row.version !== expected) return reject(409, 'VERSION_CONFLICT', 'This equipment changed. Reload before saving');
      const updated = await tx.equipment.update({ where: { organizationId_id: { organizationId: actor.organizationId, id }, version: expected }, data: { ...input, version: { increment: 1 } } });
      await audit(tx, actor, 'EQUIPMENT_UPDATED', id, { version: updated.version }); return updated;
    }));
  });
  router.get('/jobs', async (req, res) => {
    const { page, limit, q, status, priority, customerId } = parse(querySchema, req.query);
    const organizationId = context(res).membership!.organizationId;
    const where: Prisma.JobWhereInput = { organizationId, status, priority, customerId, ...(q ? { OR: [{ complaint: { contains: q, mode: 'insensitive' } }, { site: { customer: { name: { contains: q, mode: 'insensitive' } } } }, { equipment: { serialNumber: { contains: q, mode: 'insensitive' } } }] } : {}) };
    const [items, total] = await database.$transaction([database.job.findMany({ where, include: jobInclude, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit }), database.job.count({ where })]);
    res.json({ items: items.map(summary), total, page, limit });
  });
  router.post('/jobs', async (req, res) => { res.status(201).json(await jobs.create(context(res).membership!, parse(jobInputSchema, req.body))); });
  router.get('/jobs/:id', async (req, res) => {
    const id = parse(z.uuid(), req.params.id); const organizationId = context(res).membership!.organizationId;
    const row = await database.job.findUnique({ where: { organizationId_id: { organizationId, id } }, include: { ...jobInclude, events: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100, include: { actor: { include: { user: true } } } } } });
    if (!row) return reject(404, 'NOT_FOUND', 'Job not found');
    const history = await database.job.findMany({ where: { organizationId, equipmentId: row.equipmentId, id: { not: id } }, include: jobInclude, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 20 });
    const { events, ...job } = row;
    res.json({ ...job, customer: row.site.customer, timeline: events.map((event) => ({ id: event.id, kind: event.kind, note: event.note, createdAt: event.createdAt, actorName: event.actor.user.name })), equipmentHistory: history.map(summary) });
  });
  router.patch('/jobs/:id', async (req, res) => {
    const { version, ...input } = parse(jobUpdateSchema, req.body);
    res.json(await jobs.update(context(res).membership!, parse(z.uuid(), req.params.id), version, input));
  });
  router.post('/jobs/:id/transitions', async (req, res) => {
    const { version, status, reason } = parse(jobTransitionSchema, req.body);
    res.json(await jobs.transition(context(res).membership!, parse(z.uuid(), req.params.id), version, status, reason));
  });
  return router;
}
