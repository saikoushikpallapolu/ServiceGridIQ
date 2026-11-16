import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Job, Role } from '@prisma/client';
import { createDatabase } from '../src/database.js';
import { createApp } from '../src/app.js';
import { parseConfig } from '../src/config.js';
import { createAuthRouter, hashToken } from '../src/auth/router.js';
import type { IdentityProvider } from '../src/auth/oidc.js';

const db = createDatabase(process.env.DATABASE_URL!); const org = randomUUID(); const foreign = randomUUID(); const users: string[] = [];
const origin = 'http://localhost:8080'; const issuer = 'http://localhost:8082/realms/servicegrid';
const config = parseConfig({ DATABASE_URL: process.env.DATABASE_URL, AUTH_MODE: 'local', PUBLIC_ORIGIN: origin, OIDC_ISSUER: issuer, OIDC_CLIENT_ID: 'servicegrid-web' });
const provider: IdentityProvider = { authorize: async () => origin, redeem: async () => { throw new Error('unused'); }, logoutUrl: async () => origin };
const app = createApp({ checkDatabase: async () => {}, logLevel: 'silent', authRouter: createAuthRouter(db, config, provider) });
type Identity = { cookie: string; csrf: string; membershipId: string }; let owner: Identity; let dispatcher: Identity; let technician: Identity;
let branchId: string; let partId: string; let foreignPartId: string; let locationId: string; let techId: string; let customerId: string; let siteId: string; let equipmentId: string;
const date = (time: string) => new Date(`2030-01-01T${time}:00Z`);
async function identity(role: Role) { const user = await db.user.create({ data: { issuer, subject: randomUUID(), email: `${randomUUID()}@example.test`, name: `Dispatch ${role}` } }); users.push(user.id); const member = await db.membership.create({ data: { organizationId: org, userId: user.id, role } }); const token = randomBytes(32).toString('base64url'); const csrf = randomBytes(32).toString('base64url'); await db.authSession.create({ data: { tokenHash: hashToken(token), csrfToken: csrf, userId: user.id, activeOrganizationId: org, expiresAt: new Date(Date.now() + 900000) } }); return { cookie: `sg_session=${token}`, csrf, membershipId: member.id }; }
function call(method: 'get' | 'post' | 'put' | 'patch', path: string, actor = dispatcher) { return request(app)[method](`/api/v1${path}`).set('Cookie', actor.cookie).set('Origin', origin).set('X-CSRF-Token', actor.csrf).set('X-Organization-Id', org); }
async function job() { const row = await db.job.create({ data: { organizationId: org, customerId, siteId, equipmentId, status: 'TRIAGED', complaint: 'Fictional readiness test', arrivalStart: date('09:00'), arrivalEnd: date('15:00'), plannedStart: date('09:00'), partsReviewed: true, prerequisitesReviewed: true, estimatedDurationMinutes: 60, travelBufferMinutes: 30 } }); await db.jobScheduling.create({ data: { organizationId: org, jobId: row.id, branchId, generalInspection: true } }); return row; }
const version = async (row: Job) => (await db.job.findUniqueOrThrow({ where: { id: row.id } })).version;
const ready = async (row: Job) => { await call('post', `/preparation/${row.id}/ready`).send({ version: await version(row) }).expect(200); return version(row); };
const assign = async (row: Job, v: number, key = randomUUID()) => call('post', `/preparation/${row.id}/assignments`).set('Idempotency-Key', key).send({ version: v, technicianId: techId, approvalReason: 'Reviewed fictional preparation and selected technician' });
async function addPart(row: Job, state = 'REQUIRED') { return (await call('post', `/preparation/${row.id}/parts`).send({ version: await version(row), partId, locationId, quantity: '1.250', state, reason: 'Fictional manager classification' }).expect(201)).body.id as string; }
async function confirm(row: Job, id: string) { await call('post', `/preparation/${row.id}/parts/${id}/confirmations`).send({ version: await version(row), status: 'CONFIRMED', note: 'Fictional physical check at specified location' }).expect(201); }

beforeAll(async () => {
  await db.organization.createMany({ data: [org, foreign].map((id) => ({ id, slug: `dispatch-${id}`, name: `Dispatch ${id}` })) }); owner = await identity('OWNER'); dispatcher = await identity('DISPATCHER'); technician = await identity('TECHNICIAN');
  branchId = (await db.branch.create({ data: { organizationId: org, name: 'Main', nameKey: 'main', address: 'Fictional' } })).id;
  partId = (await db.part.create({ data: { organizationId: org, sku: 'TEST', name: 'Fictional filter', unit: 'each' } })).id; foreignPartId = (await db.part.create({ data: { organizationId: foreign, sku: 'PRIVATE', name: 'Private', unit: 'each' } })).id;
  locationId = (await db.stockLocation.create({ data: { organizationId: org, branchId, name: 'Fictional stores', kind: 'BRANCH' } })).id;
  techId = (await db.technician.create({ data: { organizationId: org, membershipId: technician.membershipId, branchId } })).id;
  await db.availability.create({ data: { organizationId: org, technicianId: techId, kind: 'SHIFT', startsAt: date('08:00'), endsAt: date('18:00'), reason: 'Fictional shift' } });
  customerId = (await db.customer.create({ data: { organizationId: org, name: 'Fictional customer' } })).id; siteId = (await db.serviceSite.create({ data: { organizationId: org, customerId, name: 'Kitchen', address: 'Fictional address' } })).id; equipmentId = (await db.equipment.create({ data: { organizationId: org, siteId, manufacturer: 'Demo', model: 'Demo', serialNumber: 'TEST' } })).id;
});
afterEach(async () => { await db.outboxEvent.deleteMany({ where: { organizationId: org } }); await db.idempotencyRecord.deleteMany({ where: { organizationId: org } }); await db.assignment.deleteMany({ where: { organizationId: org } }); await db.appointmentReservation.deleteMany({ where: { organizationId: org } }); });
afterAll(async () => {
  const scope = { organizationId: { in: [org, foreign] } };
  await db.outboxEvent.deleteMany({ where: scope }); await db.idempotencyRecord.deleteMany({ where: scope }); await db.assignment.deleteMany({ where: scope }); await db.appointmentReservation.deleteMany({ where: scope });
  await db.partConfirmation.deleteMany({ where: scope }); await db.prerequisiteEvidence.deleteMany({ where: scope }); await db.jobPart.deleteMany({ where: scope }); await db.jobPrerequisite.deleteMany({ where: scope }); await db.jobSkillRequirement.deleteMany({ where: scope }); await db.jobScheduling.deleteMany({ where: scope }); await db.jobEvent.deleteMany({ where: scope }); await db.auditEvent.deleteMany({ where: scope }); await db.job.deleteMany({ where: scope });
  await db.equipment.deleteMany({ where: scope }); await db.serviceSite.deleteMany({ where: scope }); await db.customer.deleteMany({ where: scope }); await db.availability.deleteMany({ where: scope }); await db.technicianSkill.deleteMany({ where: scope }); await db.technician.deleteMany({ where: scope }); await db.stockLocation.deleteMany({ where: scope }); await db.part.deleteMany({ where: scope }); await db.skill.deleteMany({ where: scope }); await db.branch.deleteMany({ where: scope }); await db.authSession.deleteMany({ where: { userId: { in: users } } }); await db.membership.deleteMany({ where: scope }); await db.user.deleteMany({ where: { id: { in: users } } }); await db.organization.deleteMany({ where: { id: { in: [org, foreign] } } }); await db.$disconnect();
});
describe('readiness and approved assignment', () => {
  it('enforces sessions, roles, company boundaries and exact-origin CSRF', async () => {
    const row = await job();
    await request(app).get(`/api/v1/preparation/${row.id}`).expect(401); await call('get', `/preparation/${row.id}`, technician).expect(403); await call('get', `/preparation/${row.id}`).set('X-Organization-Id', foreign).expect(404);
    await call('post', `/preparation/${row.id}/ready`).set('Origin', 'https://attacker.example').send({ version: 1 }).expect(403);
    await call('post', `/preparation/${row.id}/parts`).send({ version: 1, partId: foreignPartId, locationId, quantity: '1', state: 'REQUIRED', reason: 'Bad' }).expect(404);
    await expect(db.jobPart.create({ data: { organizationId: org, jobId: row.id, partId: foreignPartId, locationId, quantity: '1', state: 'REQUIRED', reason: 'Bad' } })).rejects.toThrow();
  });
  it('blocks required parts until current positive evidence and does not allow blocker overrides', async () => {
    const row = await job(); const id = await addPart(row);
    let result = await call('get', `/preparation/${row.id}/readiness`).expect(200); expect(result.body.status).toBe('BLOCKED');
    await call('post', `/preparation/${row.id}/warnings`).send({ version: await version(row), code: `PART:${id}`, reason: 'Bypass' }).expect(400);
    await call('post', `/preparation/${row.id}/ready`).send({ version: await version(row) }).expect(422);
    await confirm(row, id); result = await call('get', `/preparation/${row.id}/readiness`).expect(200); expect(result.body.status).toBe('READY'); expect(result.body.checks.find((item: { code: string }) => item.code === `PART:${id}`).verifiedBy).toBe('Dispatch DISPATCHER');
    const v = await ready(row); expect((await assign(row, v)).status).toBe(201);
  });
  it('expires evidence at approval and rejects stale or changed requirements and visit times', async () => {
    const row = await job(); const id = await addPart(row); await confirm(row, id); const v = await ready(row);
    await db.partConfirmation.updateMany({ where: { organizationId: org, jobPartId: id }, data: { confirmedAt: new Date(Date.now() - 25 * 3600000) } }); expect((await assign(row, v)).status).toBe(422);
    await confirm(row, id); expect((await db.job.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('TRIAGED');
    await call('put', `/preparation/${row.id}/parts/${id}`).send({ version: await version(row), partId, locationId, quantity: '2', state: 'REQUIRED', reason: 'Quantity corrected' }).expect(200);
    expect((await call('get', `/preparation/${row.id}/readiness`)).body.status).toBe('BLOCKED'); await confirm(row, id);
    for (const time of ['10:00', '09:00']) await call('put', `/preparation/${row.id}`).send({ version: await version(row), plannedStart: date(time).toISOString(), partsReviewed: true, prerequisitesReviewed: true }).expect(200);
    expect((await call('get', `/preparation/${row.id}/readiness`)).body.status).toBe('BLOCKED');
  });
  it('requires mandatory prerequisite evidence and preserves checks without a deletion path', async () => {
    const row = await job(); const created = await call('post', `/preparation/${row.id}/prerequisites`).send({ version: 1, code: 'SAFE_ACCESS', kind: 'SAFETY', label: 'Isolation verified', rationale: 'Fictional mandatory policy' }).expect(201);
    const id = created.body.id as string; await call('post', `/preparation/${row.id}/ready`).send({ version: await version(row) }).expect(422);
    for (const status of ['FAIL', 'PASS']) await call('post', `/preparation/${row.id}/prerequisites/${id}/evidence`).send({ version: await version(row), status, note: `Fictional check: ${status}` }).expect(201);
    expect((await call('get', `/preparation/${row.id}/readiness`)).body.status).toBe('READY'); expect(await db.prerequisiteEvidence.count({ where: { prerequisiteId: id } })).toBe(2);
    await request(app).delete(`/api/v1/preparation/${row.id}/prerequisites/${id}`).set('Cookie', dispatcher.cookie).set('X-Organization-Id', org).set('Origin', origin).set('X-CSRF-Token', dispatcher.csrf).expect(404);
  });
  it('requires warning reasons and invalidates acknowledged warnings on a material edit', async () => {
    const row = await job(); const id = await addPart(row, 'SUSPECTED');
    expect((await call('get', `/preparation/${row.id}/readiness`)).body.status).toBe('NEEDS_REVIEW');
    await call('post', `/preparation/${row.id}/warnings`).send({ version: await version(row), code: `PART:${id}`, reason: 'Inspection first; part remains suspected' }).expect(200); await ready(row);
    await call('put', `/preparation/${row.id}`).send({ version: await version(row), plannedStart: date('09:00').toISOString(), partsReviewed: true, prerequisitesReviewed: true }).expect(200);
    expect((await call('get', `/preparation/${row.id}/readiness`)).body.status).toBe('NEEDS_REVIEW');
  });
  it('commits assignment, reservation, approval snapshots, timeline, audit and outbox exactly once', async () => {
    const row = await job(); const v = await ready(row); const key = randomUUID();
    const first = await assign(row, v, key); expect(first.status).toBe(201); const second = await assign(row, v, key); expect(second.status).toBe(201); expect(second.body).toEqual(first.body);
    const where = { organizationId: org };
    expect(await Promise.all([db.assignment.count({ where }), db.appointmentReservation.count({ where }), db.outboxEvent.count({ where }), db.idempotencyRecord.count({ where })])).toEqual([1, 1, 1, 1]);
    const assignment = await db.assignment.findUniqueOrThrow({ where: { id: first.body.assignmentId as string } }); expect(assignment.readinessSnapshot).toHaveProperty('manualPartsNotice'); expect(assignment.rankingSnapshot).toHaveProperty('policyVersion', 'dispatch-v2');
    expect(await db.auditEvent.count({ where: { organizationId: org, targetId: row.id, action: 'JOB_ASSIGNED' } })).toBe(1);
    await call('post', `/preparation/${row.id}/assignments`).set('Idempotency-Key', key).send({ version: v, technicianId: techId, approvalReason: 'Different payload' }).expect(409);
    expect((await assign(row, v)).status).toBe(409);
  });
  it('allows exactly one simultaneous overlapping approved assignment and leaves no partial loser', async () => {
    const a = await job(); const b = await job(); const va = await ready(a); const vb = await ready(b);
    const results = await Promise.all([assign(a, va), assign(b, vb)]); expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(await db.assignment.count({ where: { organizationId: org } })).toBe(1); expect(await db.outboxEvent.count({ where: { organizationId: org } })).toBe(1); expect(await db.idempotencyRecord.count({ where: { organizationId: org } })).toBe(1);
    expect(await db.job.count({ where: { id: { in: [a.id, b.id] }, status: 'READY' } })).toBe(1);
  });
  it('requires new readiness approval after an owner freshness policy change', async () => {
    const row = await job(); const v = await ready(row); const policy = (await call('get', '/dispatch-policy')).body as { hours: number; policyVersion: number };
    await call('put', '/dispatch-policy').send({ hours: 1, policyVersion: policy.policyVersion }).expect(403); await call('put', '/dispatch-policy', owner).send({ hours: 169, policyVersion: policy.policyVersion }).expect(400);
    await call('put', '/dispatch-policy', owner).send({ hours: 1, policyVersion: policy.policyVersion }).expect(200); expect((await assign(row, v)).status).toBe(409); expect((await assign(row, await ready(row))).status).toBe(201);
  });
  it('returns explainable weighted ranking, no-history flags and no score for ineligible technicians', async () => {
    const row = await job(); const result = await call('post', `/preparation/${row.id}/ranking`).send({ version: 1 }).expect(200);
    expect(result.body.candidates[0]).toMatchObject({ eligible: true, skillDepth: 50, workloadHeadroom: 100, assetFamiliarity: 0, historyStatus: 'NO_HISTORY', score: 55 });
    await db.membership.update({ where: { id: technician.membershipId }, data: { active: false } });
    try { expect((await call('post', `/preparation/${row.id}/ranking`).send({ version: 1 })).body.candidates[0]).toMatchObject({ eligible: false, score: null }); } finally { await db.membership.update({ where: { id: technician.membershipId }, data: { active: true } }); }
  });
  it('validates quantities, protects active assignments and rejects stale approval versions', async () => {
    const row = await job();
    for (const quantity of ['0', '-1', '1.2345', '1e3']) await call('post', `/preparation/${row.id}/parts`).send({ version: 1, partId, locationId, quantity, state: 'REQUIRED', reason: 'Invalid' }).expect(400);
    const v = await ready(row); expect((await assign(row, v - 1)).status).toBe(409); expect((await assign(row, v)).status).toBe(201);
    await call('put', `/preparation/${row.id}`).send({ version: await version(row), plannedStart: date('10:00').toISOString(), partsReviewed: true, prerequisitesReviewed: true }).expect(409);
    await db.appointmentReservation.updateMany({ where: { organizationId: org, jobId: row.id }, data: { active: false } });
    await call('post', `/jobs/${row.id}/transitions`).send({ version: await version(row), status: 'DRAFT', reason: 'Cannot bypass assigned lifecycle' }).expect(409);
  });
  it('allows unrelated skill verification on booked technicians but prevents invalidating required qualifications', async () => {
    const row = await job();
    const skill = await db.skill.create({ data: { organizationId: org, name: 'Fictional required skill', nameKey: 'fictional required skill' } });
    const policy = await db.jobScheduling.findUniqueOrThrow({ where: { jobId: row.id } });
    await db.jobScheduling.update({ where: { id: policy.id }, data: { generalInspection: false } }); await db.jobSkillRequirement.create({ data: { organizationId: org, schedulingId: policy.id, skillId: skill.id, level: 2 } });
    const techVersion = async () => (await db.technician.findUniqueOrThrow({ where: { id: techId } })).version;
    const verify = (skillId: string, level: number) => call('put', `/technicians/${techId}/skills/${skillId}`, owner).send({ version: 1, level, active: true, expiresAt: null, evidence: 'Fictional owner verification' });
    await verify(skill.id, 2).expect(200); expect((await assign(row, await ready(row))).status).toBe(201);
    await call('put', `/technicians/${techId}/skills/${skill.id}`, owner).send({ version: await techVersion(), level: 1, active: true, expiresAt: null, evidence: 'Unsafe downgrade' }).expect(409);
    const additional = await db.skill.create({ data: { organizationId: org, name: 'Fictional unrelated skill', nameKey: 'fictional unrelated skill' } });
    await call('put', `/technicians/${techId}/skills/${additional.id}`, owner).send({ version: await techVersion(), level: 1, active: true, expiresAt: null, evidence: 'Additional verified skill' }).expect(200);
  });
});
