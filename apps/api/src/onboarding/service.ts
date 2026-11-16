import { createHash, randomUUID } from 'node:crypto';
import { Prisma, type Membership, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { customerInputSchema, siteInputSchema, equipmentInputSchema, technicianInputSchema, jobInputSchema, partInputSchema, validArrivalWindow, importDryRunInputSchema } from '@servicegrid/contracts';
import { companyWrite, audit } from '../intake/service.js';
import { json } from '../dispatch/service.js';
import { reject } from '../auth/errors.js';
import { MAX_BYTES, parseCsv } from './csv.js';

type Input = z.infer<typeof importDryRunInputSchema>;
type Kind = Input['kind'];
export const columns: Record<Kind, string[]> = {
  customers: ['external_id', 'name', 'email', 'phone'],
  sites: ['external_id', 'customer_external_id', 'name', 'address', 'access_notes'],
  equipment: ['external_id', 'site_external_id', 'manufacturer', 'model', 'serial_number', 'notes'],
  technicians: ['external_id', 'membership_id', 'branch_id'],
  jobs: ['external_id', 'customer_external_id', 'site_external_id', 'equipment_external_id', 'complaint', 'service_category', 'priority', 'arrival_start', 'arrival_end', 'duration_minutes', 'buffer_minutes'],
  parts: ['external_id', 'sku', 'name', 'unit'],
};
const schemas = { customers: customerInputSchema, sites: siteInputSchema, equipment: equipmentInputSchema, technicians: technicianInputSchema, jobs: jobInputSchema, parts: partInputSchema };
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
type Issue = { row: number; field: string; code: string; message: string };
type Row = { row: number; externalId: string; contentHash: string; internalId: string; data: Record<string, unknown>; skip: boolean };
export async function planImport(tx: Prisma.TransactionClient, org: string, input: Pick<Input, 'kind' | 'sourceSystem' | 'mapping'>, csv: string) {
  const records = parseCsv(csv); const headers = records[0]!; const expected = columns[input.kind];
  if (Object.keys(input.mapping).some((key) => !expected.includes(key))) return reject(400, 'INVALID_MAPPING', 'Mapping contains an unsupported target field');
  const sourceHeaders = expected.map((key) => input.mapping[key] ?? key);
  if (new Set(sourceHeaders).size !== sourceHeaders.length || sourceHeaders.some((key) => !headers.includes(key)) || headers.some((key) => !sourceHeaders.includes(key))) return reject(400, 'INVALID_MAPPING', 'Map every expected field to one unique header; remove unsupported columns');
  const mappings = await tx.externalRecord.findMany({ where: { organizationId: org, sourceSystem: input.sourceSystem } });
  const mapped = new Map(mappings.map((item) => [`${item.kind}:${item.externalId}`, item]));
  const [customers, sites, equipment, technicians, memberships, branches, parts, jobs] = await Promise.all([
    tx.customer.findMany({ where: { organizationId: org }, select: { id: true } }), tx.serviceSite.findMany({ where: { organizationId: org }, select: { id: true, customerId: true } }),
    tx.equipment.findMany({ where: { organizationId: org }, select: { id: true, siteId: true } }), tx.technician.findMany({ where: { organizationId: org }, select: { id: true, membershipId: true } }),
    tx.membership.findMany({ where: { organizationId: org, active: true, role: 'TECHNICIAN', user: { active: true } }, select: { id: true } }), tx.branch.findMany({ where: { organizationId: org }, select: { id: true } }),
    tx.part.findMany({ where: { organizationId: org }, select: { id: true, sku: true } }), tx.job.findMany({ where: { organizationId: org }, select: { id: true } }),
  ]);
  const ids = { customers, sites, equipment, technicians, parts, jobs }; const errors: Issue[] = []; let errorCount = 0;
  const issue = (row: number, field: string, code: string, message: string) => { errorCount++; if (errors.length < 200) errors.push({ row, field, code, message }); };
  const seen = new Set<string>(); const unique = new Set<string>(); const rows: Row[] = [];
  for (let index = 1; index < records.length; index++) {
    const cells = records[index]!; const row = index + 1; const before = errorCount;
    if (cells.length !== headers.length) { issue(row, '*', 'COLUMN_COUNT', 'Row has a different number of fields than the header'); continue; }
    const raw = Object.fromEntries(expected.map((key, i) => [key, cells[headers.indexOf(sourceHeaders[i]!)]!.trim()]));
    if (!raw.external_id || raw.external_id.length > 160) issue(row, 'external_id', 'INVALID_EXTERNAL_ID', 'External ID must contain 1–160 characters');
    if (seen.has(raw.external_id!)) issue(row, 'external_id', 'DUPLICATE_KEY', 'External ID occurs more than once in this file'); seen.add(raw.external_id!);
    const reference = (kind: Kind, field: string) => { const value = mapped.get(`${kind}:${raw[field]}`); if (!value || !ids[kind].some((item) => item.id === value.internalId)) { issue(row, field, 'REFERENCE_NOT_FOUND', 'Import the referenced record first using this company and source system'); return '00000000-0000-4000-8000-000000000000'; } return value.internalId; };
    let data: Record<string, unknown>;
    switch (input.kind) {
      case 'customers': data = { name: raw.name, email: raw.email || null, phone: raw.phone || null }; break;
      case 'sites': data = { customerId: reference('customers', 'customer_external_id'), name: raw.name, address: raw.address, accessNotes: raw.access_notes }; break;
      case 'equipment': data = { siteId: reference('sites', 'site_external_id'), manufacturer: raw.manufacturer, model: raw.model, serialNumber: raw.serial_number, notes: raw.notes }; break;
      case 'technicians': data = { membershipId: raw.membership_id, branchId: raw.branch_id }; break;
      case 'parts': data = { sku: raw.sku, name: raw.name, unit: raw.unit }; break;
      case 'jobs': data = { customerId: reference('customers', 'customer_external_id'), siteId: reference('sites', 'site_external_id'), equipmentId: reference('equipment', 'equipment_external_id'), complaint: raw.complaint, serviceCategory: raw.service_category, priority: raw.priority, arrivalStart: raw.arrival_start, arrivalEnd: raw.arrival_end, estimatedDurationMinutes: raw.duration_minutes ? Number(raw.duration_minutes) : NaN, travelBufferMinutes: raw.buffer_minutes ? Number(raw.buffer_minutes) : NaN }; break;
    }
    const parsed = schemas[input.kind].safeParse(data);
    if (!parsed.success) { for (const value of parsed.error.issues) issue(row, value.path.join('.'), 'INVALID_VALUE', value.message); continue; }
    data = parsed.data;
    const contentHash = hash(JSON.stringify(data)); const existing = mapped.get(`${input.kind}:${raw.external_id}`);
    if (existing && existing.contentHash !== contentHash) issue(row, 'external_id', 'CONTENT_CONFLICT', 'This external ID was imported with different data; review changes through the ordinary application workflow');
    if (existing && !ids[input.kind].some((item) => item.id === existing.internalId)) issue(row, 'external_id', 'MAPPING_TARGET_MISSING', 'Mapped record is unavailable; ask the company owner to review provenance');
    if (input.kind === 'technicians') {
      if (!memberships.some((member) => member.id === data.membershipId)) issue(row, 'membership_id', 'MEMBERSHIP_REQUIRED', 'Use an existing active technician membership in this company');
      if (!branches.some((branch) => branch.id === data.branchId)) issue(row, 'branch_id', 'REFERENCE_NOT_FOUND', 'Branch must belong to this company');
      if (unique.has(String(data.membershipId)) || technicians.some((tech) => tech.membershipId === data.membershipId && tech.id !== existing?.internalId)) issue(row, 'membership_id', 'PROFILE_EXISTS', 'Membership already has a technician profile or occurs twice in this file'); unique.add(String(data.membershipId));
    }
    if (input.kind === 'parts') { if (unique.has(String(data.sku)) || parts.some((part) => part.sku === data.sku && part.id !== existing?.internalId)) issue(row, 'sku', 'SKU_EXISTS', 'SKU already exists or occurs twice in this file'); unique.add(String(data.sku)); }
    if (input.kind === 'jobs') {
      if (!validArrivalWindow(parsed.data as z.infer<typeof jobInputSchema>)) issue(row, 'arrival_end', 'INVALID_WINDOW', 'Arrival end must follow start within seven days');
      if (!sites.some((site) => site.id === data.siteId && site.customerId === data.customerId) || !equipment.some((item) => item.id === data.equipmentId && item.siteId === data.siteId)) issue(row, 'equipment_external_id', 'REFERENCE_CHAIN', 'Customer, site and equipment must form the same authorized chain');
    }
    if (errorCount === before) rows.push({ row, externalId: raw.external_id!, contentHash, internalId: existing?.internalId ?? randomUUID(), data, skip: !!existing });
  }
  return { rows, validation: { valid: errorCount === 0, totalRows: records.length - 1, createCount: rows.filter((row) => !row.skip).length, skipCount: rows.filter((row) => row.skip).length, errorCount, errors } };
}
export const batchDto = (batch: Prisma.ImportBatchGetPayload<object>) => { const { payload, organizationId, actorMembershipId, ...dto } = batch; void payload; void organizationId; void actorMembershipId; return dto; };
export async function purgeExpiredImports(db: PrismaClient) { await db.importBatch.updateMany({ where: { expiresAt: { lte: new Date() }, NOT: { payload: { equals: Prisma.DbNull } } }, data: { payload: Prisma.DbNull } }); }
export function createImportService(db: PrismaClient) {
  return {
    dryRun: (actor: Membership, input: Input) => {
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(input.csvBase64)) return reject(400, 'INVALID_ENCODING', 'CSV upload must be canonical base64');
      const bytes = Buffer.from(input.csvBase64, 'base64'); if (!bytes.length || bytes.length > MAX_BYTES || bytes.toString('base64') !== input.csvBase64) return reject(400, 'INVALID_ENCODING', 'CSV must be at most 5 MiB');
      let csv: string; try { csv = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); } catch { return reject(400, 'INVALID_ENCODING', 'Save the file as UTF-8 CSV'); }
      return companyWrite(db, actor, ['OWNER'], async (tx, current) => {
        const plan = await planImport(tx, current.organizationId, input, csv);
        const batch = await tx.importBatch.create({ data: { organizationId: current.organizationId, actorMembershipId: current.id, kind: input.kind, sourceSystem: input.sourceSystem, fileHash: createHash('sha256').update(bytes).digest('hex'), payload: json({ csv, mapping: input.mapping }), validation: json(plan.validation), status: plan.validation.valid ? 'VALIDATED' : 'INVALID', expiresAt: new Date(Date.now() + 86400000) } });
        await audit(tx, current, 'IMPORT_DRY_RUN', batch.id, { kind: input.kind, rows: plan.validation.totalRows, errors: plan.validation.errorCount }); return batchDto(batch);
      }, { timeout: 60_000 });
    },
    commit: (actor: Membership, batchId: string, fileHash: string, key: string) => companyWrite(db, actor, ['OWNER'], async (tx, current) => {
      const batch = await tx.importBatch.findUnique({ where: { organizationId_id: { organizationId: current.organizationId, id: batchId } } });
      if (!batch || batch.actorMembershipId !== current.id) return reject(404, 'NOT_FOUND', 'Import batch not found');
      if (batch.fileHash !== fileHash) return reject(409, 'HASH_CONFLICT', 'Commit must reference the reviewed file hash');
      const requestHash = hash(JSON.stringify({ operation: 'IMPORT_COMMIT', batchId, fileHash }));
      const previous = await tx.idempotencyRecord.findUnique({ where: { organizationId_key: { organizationId: current.organizationId, key } } });
      if (previous) { if (previous.requestHash !== requestHash || previous.actorMembershipId !== current.id) return reject(409, 'IDEMPOTENCY_CONFLICT', 'Key belongs to a different request'); return previous.response; }
      if (batch.status === 'COMMITTED') { const response = json({ committed: true, batch: batchDto(batch) }); await tx.idempotencyRecord.create({ data: { organizationId: current.organizationId, actorMembershipId: current.id, key, requestHash, response } }); return response; }
      if (batch.expiresAt <= new Date() || batch.payload === null) return reject(409, 'IMPORT_EXPIRED', 'Dry run expired; upload and review a new dry run');
      if (batch.status !== 'VALIDATED') return reject(409, 'IMPORT_INVALID', 'Correct the row errors and create a new dry run');
      const payload = z.object({ csv: z.string(), mapping: z.record(z.string(), z.string()) }).parse(batch.payload);
      const kind = batch.kind as Kind; const plan = await planImport(tx, current.organizationId, { kind, sourceSystem: batch.sourceSystem, mapping: payload.mapping }, payload.csv);
      if (!plan.validation.valid) { const updated = await tx.importBatch.update({ where: { id: batchId }, data: { status: 'INVALID', validation: json(plan.validation) } }); await audit(tx, current, 'IMPORT_COMMIT_REJECTED', batchId, { errors: plan.validation.errorCount }); return { committed: false, batch: batchDto(updated) }; }
      const fresh = plan.rows.filter((row) => !row.skip); const data = fresh.map((row) => ({ ...row.data, id: row.internalId, organizationId: current.organizationId }));
      switch (kind) {
        case 'customers': await tx.customer.createMany({ data: data as Prisma.CustomerCreateManyInput[] }); break;
        case 'sites': await tx.serviceSite.createMany({ data: data as Prisma.ServiceSiteCreateManyInput[] }); break;
        case 'equipment': await tx.equipment.createMany({ data: data as Prisma.EquipmentCreateManyInput[] }); break;
        case 'technicians': await tx.technician.createMany({ data: data as Prisma.TechnicianCreateManyInput[] }); break;
        case 'parts': await tx.part.createMany({ data: data as Prisma.PartCreateManyInput[] }); break;
        case 'jobs': await tx.job.createMany({ data: data as Prisma.JobCreateManyInput[] }); await tx.jobEvent.createMany({ data: fresh.map((row) => ({ organizationId: current.organizationId, actorMembershipId: current.id, jobId: row.internalId, kind: 'JOB_IMPORTED', note: 'Imported as a draft; no operational state or historical outcome was applied.', details: { batchId, version: 1 } })) }); break;
      }
      await tx.externalRecord.createMany({ data: fresh.map((row) => ({ organizationId: current.organizationId, sourceSystem: batch.sourceSystem, kind, externalId: row.externalId, internalId: row.internalId, contentHash: row.contentHash })) });
      const updated = await tx.importBatch.update({ where: { id: batchId }, data: { status: 'COMMITTED', committedAt: new Date(), validation: json(plan.validation) } });
      await audit(tx, current, 'IMPORT_COMMITTED', batchId, { kind, created: fresh.length, skipped: plan.validation.skipCount });
      const response = json({ committed: true, batch: batchDto(updated) }); await tx.idempotencyRecord.create({ data: { organizationId: current.organizationId, actorMembershipId: current.id, key, requestHash, response } }); return response;
    }, { timeout: 60_000 }),
  };
}
