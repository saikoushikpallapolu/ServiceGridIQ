import express, { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { PrismaClient, ReportExclusion } from '@prisma/client';
import { importDryRunInputSchema, importCommitInputSchema, importKindSchema, reportExclusionInputSchema } from '@servicegrid/contracts';
import { context } from '../auth/context.js';
import { reject } from '../auth/errors.js';
import { audit, companyWrite } from '../intake/service.js';
import { createImportService, batchDto, columns, purgeExpiredImports } from './service.js';
import { operationalReport } from './reports.js';
import { writeCsv } from './csv.js';

function parse<T>(schema: z.ZodType<T>, value: unknown): T { const result = schema.safeParse(value); if (!result.success) return reject(400, 'INVALID_REQUEST', 'Check required fields, dates and limits'); return result.data; }
const exclusionDto = ({ jobId, reason, note, version, updatedAt }: ReportExclusion) => ({ jobId, reason, note, version, updatedAt });
const pageQuery = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1), limit: z.coerce.number().int().min(1).max(100).default(25), action: z.string().regex(/^[A-Z_]{1,80}$/).optional(), from: z.iso.datetime({ offset: true }).optional(), to: z.iso.datetime({ offset: true }).optional() }).strict();
export function createOnboardingRouter(db: PrismaClient, csrf: RequestHandler) {
  const router = Router(); const service = createImportService(db);
  router.use(['/imports', '/exports', '/reports', '/audit-history'], (req, res, next) => { if (context(res).membership!.role !== 'OWNER') return reject(403, 'FORBIDDEN', 'Company owner access required'); if (req.method !== 'GET') return csrf(req, res, next); next(); });
  router.get('/imports/templates/:kind', (req, res) => { const kind = parse(importKindSchema, req.params.kind); res.type('text/csv').attachment(`${kind}-template.csv`).send(writeCsv(columns[kind], [])); });
  router.post('/imports/dry-run', express.json({ limit: '8mb' }), async (req, res) => { const input = parse(importDryRunInputSchema, req.body); await purgeExpiredImports(db); res.status(201).json(await service.dryRun(context(res).membership!, input)); });
  router.get('/imports/:id', async (req, res) => { const actor = context(res).membership!; const batch = await db.importBatch.findFirst({ where: { organizationId: actor.organizationId, id: parse(z.uuid(), req.params.id), actorMembershipId: actor.id } }); if (!batch) return reject(404, 'NOT_FOUND', 'Import batch not found'); res.json(batchDto(batch)); });
  router.post('/imports/:id/commit', async (req, res) => { const { fileHash } = parse(importCommitInputSchema, req.body); const key = parse(z.string().regex(/^[A-Za-z0-9_-]{16,100}$/), req.get('Idempotency-Key')); res.json(await service.commit(context(res).membership!, parse(z.uuid(), req.params.id), fileHash, key)); });
  router.post('/exports', async (req, res) => {
    const { kind, page, limit } = parse(z.object({ kind: importKindSchema, page: z.number().int().min(1).max(10000).default(1), limit: z.number().int().min(1).max(2000).default(1000) }).strict(), req.body);
    const actor = context(res).membership!;
    const result = await companyWrite(db, actor, ['OWNER'], async (tx, current) => {
      const args = { where: { organizationId: current.organizationId }, orderBy: { id: 'asc' as const }, skip: (page - 1) * limit, take: limit };
      let rows: Record<string, unknown>[]; let total: number; let headers: string[];
      switch (kind) {
        case 'customers': rows = await tx.customer.findMany(args); total = await tx.customer.count({ where: args.where }); headers = ['id', 'name', 'email', 'phone', 'version']; break;
        case 'sites': rows = await tx.serviceSite.findMany(args); total = await tx.serviceSite.count({ where: args.where }); headers = ['id', 'customerId', 'name', 'address', 'accessNotes', 'version']; break;
        case 'equipment': rows = await tx.equipment.findMany(args); total = await tx.equipment.count({ where: args.where }); headers = ['id', 'siteId', 'manufacturer', 'model', 'serialNumber', 'notes', 'version']; break;
        case 'technicians': { const profiles = await tx.technician.findMany({ ...args, include: { membership: { include: { user: { select: { name: true, email: true } } } } } }); rows = profiles.map(({ membership, ...row }) => ({ ...row, name: membership.user.name, email: membership.user.email })); total = await tx.technician.count({ where: args.where }); headers = ['id', 'membershipId', 'branchId', 'name', 'email', 'active', 'safetyRestricted', 'version']; break; }
        case 'parts': rows = await tx.part.findMany(args); total = await tx.part.count({ where: args.where }); headers = ['id', 'sku', 'name', 'unit']; break;
        case 'jobs': { const jobs = await tx.job.findMany({ ...args, include: { closure: true, reportExclusion: true } }); rows = jobs.map(({ closure, reportExclusion, ...row }) => ({ ...row, outcome: closure?.outcome, followUpReason: closure?.followUpReason, closedAt: closure?.closedAt, reportingExclusion: reportExclusion?.reason })); total = await tx.job.count({ where: args.where }); headers = ['id', 'customerId', 'siteId', 'equipmentId', 'jobType', 'parentJobId', 'rootJobId', 'complaint', 'serviceCategory', 'priority', 'status', 'arrivalStart', 'arrivalEnd', 'estimatedDurationMinutes', 'travelBufferMinutes', 'version', 'outcome', 'followUpReason', 'closedAt', 'reportingExclusion']; break; }
      }
      const maps = await tx.externalRecord.findMany({ where: { organizationId: current.organizationId, kind, internalId: { in: rows.map((row) => String(row.id)) } }, orderBy: [{ sourceSystem: 'asc' }, { externalId: 'asc' }] });
      const csv = writeCsv([...headers, 'externalReferences'], rows.map((row) => [...headers.map((name) => row[name]), JSON.stringify(maps.filter((item) => item.internalId === row.id).map(({ sourceSystem, externalId }) => ({ sourceSystem, externalId })))]));
      await audit(tx, current, 'CSV_EXPORTED', current.organizationId, { kind, page, limit, rows: rows.length, total }); return { csv, total };
    }, { timeout: 60_000 });
    res.set('X-Total-Count', String(result.total)).set('X-Export-Page', String(page)).type('text/csv').attachment(`servicegrid-${kind}-page-${page}.csv`).send(result.csv);
  });
  router.get('/reports/operations', async (req, res) => {
    const input = parse(z.object({ from: z.iso.datetime({ offset: true }), to: z.iso.datetime({ offset: true }) }).strict(), req.query); const from = new Date(input.from); const to = new Date(input.to);
    if (to <= from || to.getTime() - from.getTime() > 366 * 86400000) return reject(400, 'INVALID_RANGE', 'Choose an increasing range of at most 366 days');
    res.json(await db.$transaction((tx) => operationalReport(tx, context(res).membership!.organizationId, from, to), { isolationLevel: 'RepeatableRead', timeout: 60_000 }));
  });
  router.get('/reports/exclusions/:id', async (req, res) => { const jobId = parse(z.uuid(), req.params.id); const organizationId = context(res).membership!.organizationId; if (!await db.job.findUnique({ where: { organizationId_id: { organizationId, id: jobId } } })) return reject(404, 'NOT_FOUND', 'Job not found'); const row = await db.reportExclusion.findUnique({ where: { organizationId_jobId: { organizationId, jobId } } }); res.json(row ? exclusionDto(row) : { jobId, reason: null, note: '', version: 1, updatedAt: null }); });
  router.put('/reports/exclusions/:id', async (req, res) => { const jobId = parse(z.uuid(), req.params.id); const input = parse(reportExclusionInputSchema, req.body); res.json(await companyWrite(db, context(res).membership!, ['OWNER'], async (tx, current) => { const organizationId = current.organizationId; if (!await tx.job.findUnique({ where: { organizationId_id: { organizationId, id: jobId } } })) return reject(404, 'NOT_FOUND', 'Job not found'); const previous = await tx.reportExclusion.findUnique({ where: { organizationId_jobId: { organizationId, jobId } } }); if ((previous?.version ?? 1) !== input.version) return reject(409, 'VERSION_CONFLICT', 'Exclusion changed; reload before saving'); const data = { reason: input.reason, note: input.note, actorMembershipId: current.id, version: input.version + 1 }; const row = await tx.reportExclusion.upsert({ where: { organizationId_jobId: { organizationId, jobId } }, create: { ...data, organizationId, jobId }, update: data }); await audit(tx, current, 'REPORT_EXCLUSION_CHANGED', jobId, { reason: input.reason, note: input.note, version: row.version }); return exclusionDto(row); })); });
  router.get('/audit-history', async (req, res) => {
    const { page, limit, action, from, to } = parse(pageQuery, req.query); if (from && to && new Date(to) <= new Date(from)) return reject(400, 'INVALID_RANGE', 'Audit end must follow start');
    const where = { organizationId: context(res).membership!.organizationId, ...(action ? { action } : {}), ...(from || to ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lt: new Date(to) } : {}) } } : {}) };
    const [rows, total] = await db.$transaction([db.auditEvent.findMany({ where, include: { actor: { include: { user: { select: { name: true } } } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit }), db.auditEvent.count({ where })]);
    res.json({ items: rows.map(({ actor, organizationId, actorMembershipId, ...row }) => { void organizationId; void actorMembershipId; return { ...row, actorName: actor.user.name }; }), total, page, limit });
  });
  return router;
}
