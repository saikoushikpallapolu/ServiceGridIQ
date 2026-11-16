import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Prisma, PrismaClient } from '@prisma/client';
import { visitActionInputSchema, closeVisitInputSchema, observationInputSchema, cancelVisitInputSchema, rescheduleVisitInputSchema } from '@servicegrid/contracts';
import { context } from '../auth/context.js';
import { reject } from '../auth/errors.js';
import { createVisitService, visitCard } from './service.js';

function parse<T>(schema: z.ZodType<T>, value: unknown): T { const result = schema.safeParse(value); if (!result.success) return reject(400, 'INVALID_REQUEST', 'Check visit fields, required notes and values'); return result.data; }
const uuid = z.uuid();
const pageQuery = z.object({ scope: z.enum(['ACTIVE', 'HISTORY']).default('ACTIVE'), q: z.string().trim().max(160).optional(), page: z.coerce.number().int().min(1).max(10000).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) }).strict();
export function createVisitRouter(db: PrismaClient, csrf: RequestHandler) {
  const router = Router(); const service = createVisitService(db);
  router.use(['/my-assignments', '/visits'], (req, res, next) => { if (req.method !== 'GET') return csrf(req, res, next); next(); });
  router.get('/my-assignments', async (req, res) => {
    const actor = context(res).membership!; if (actor.role !== 'TECHNICIAN') return reject(403, 'FORBIDDEN', 'Technician workspace requires technician membership');
    const { scope, q, page, limit } = parse(pageQuery, req.query);
    const where: Prisma.AssignmentWhereInput = { organizationId: actor.organizationId, technician: { organizationId: actor.organizationId, membershipId: actor.id, active: true }, ...(scope === 'ACTIVE' ? { active: true, job: { status: { in: ['ASSIGNED', 'ACKNOWLEDGED', 'IN_PROGRESS'] }, ...(q ? { complaint: { contains: q, mode: 'insensitive' } } : {}) } } : { active: false, releaseKind: { in: ['CLOSED', 'CANCELLED'] }, job: { status: { in: ['CLOSED', 'CANCELLED'] }, ...(q ? { complaint: { contains: q, mode: 'insensitive' } } : {}) } }) };
    const [rows, total] = await db.$transaction([db.assignment.findMany({ where, include: { reservation: true, job: { include: { site: { include: { customer: true } } } } }, orderBy: scope === 'ACTIVE' ? [{ reservation: { plannedStart: 'asc' } }, { id: 'asc' }] : [{ approvedAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit }), db.assignment.count({ where })]);
    res.json({ items: rows.map((row) => ({ assignmentId: row.id, jobId: row.jobId, version: row.job.version, status: row.job.status, jobType: row.job.jobType, customerName: row.job.site.customer.name, complaint: row.job.complaint, plannedStart: row.reservation.plannedStart, endsAt: row.reservation.endsAt })), page, limit, total });
  });
  router.get('/my-assignments/:id', async (req, res) => { const actor = context(res).membership!; if (actor.role !== 'TECHNICIAN') return reject(403, 'FORBIDDEN', 'Use the dispatcher visit view'); res.json(await db.$transaction((tx) => visitCard(tx, actor, parse(uuid, req.params.id)), { isolationLevel: 'RepeatableRead' })); });
  router.get('/visits/jobs/:jobId', async (req, res) => {
    const actor = context(res).membership!; if (!['OWNER', 'DISPATCHER'].includes(actor.role)) return reject(403, 'FORBIDDEN', 'Dispatcher or owner access required'); const jobId = parse(uuid, req.params.jobId);
    res.json(await db.$transaction(async (tx) => {
      const job = await tx.job.findUnique({ where: { organizationId_id: { organizationId: actor.organizationId, id: jobId } }, include: { closure: true, followUp: { select: { id: true } } } }); if (!job) return reject(404, 'NOT_FOUND', 'Job not found');
      const assignment = job.closure ? await tx.assignment.findUnique({ where: { id: job.closure.assignmentId } }) : await tx.assignment.findFirst({ where: { organizationId: actor.organizationId, jobId }, orderBy: [{ active: 'desc' }, { approvedAt: 'desc' }, { id: 'desc' }] });
      return { jobVersion: job.version, followUpJobId: job.followUp?.id ?? null, visit: assignment ? await visitCard(tx, actor, assignment.id) : null };
    }, { isolationLevel: 'RepeatableRead' }));
  });
  const key = (value: unknown) => parse(z.string().regex(/^[A-Za-z0-9_-]{16,100}$/), value);
  router.post('/visits/:jobId/acknowledge', async (req, res) => { res.json(await service.acknowledge(context(res).membership!, parse(uuid, req.params.jobId), parse(visitActionInputSchema, req.body), key(req.get('Idempotency-Key')))); });
  router.post('/visits/:jobId/start', async (req, res) => { res.json(await service.start(context(res).membership!, parse(uuid, req.params.jobId), parse(visitActionInputSchema, req.body), key(req.get('Idempotency-Key')))); });
  router.post('/visits/:jobId/observations', async (req, res) => { res.status(201).json(await service.observe(context(res).membership!, parse(uuid, req.params.jobId), parse(observationInputSchema, req.body), key(req.get('Idempotency-Key')))); });
  router.post('/visits/:jobId/close', async (req, res) => { res.json(await service.close(context(res).membership!, parse(uuid, req.params.jobId), parse(closeVisitInputSchema, req.body), key(req.get('Idempotency-Key')))); });
  router.post('/visits/:jobId/cancel', async (req, res) => { res.json(await service.cancel(context(res).membership!, parse(uuid, req.params.jobId), parse(cancelVisitInputSchema, req.body), key(req.get('Idempotency-Key')))); });
  router.post('/visits/:jobId/reschedule', async (req, res) => { res.json(await service.reschedule(context(res).membership!, parse(uuid, req.params.jobId), parse(rescheduleVisitInputSchema, req.body), key(req.get('Idempotency-Key')))); });
  return router;
}
