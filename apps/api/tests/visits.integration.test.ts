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
type Identity = { cookie: string; csrf: string; membershipId: string }; let owner: Identity; let dispatcher: Identity; let technician: Identity; let otherTech: Identity;
let branchId: string; let partId: string; let locationId: string; let techId: string; let customerId: string; let siteId: string; let equipmentId: string;
const date = (time: string) => new Date(`2030-02-01T${time}:00Z`);
async function identity(role: Role) { const user = await db.user.create({ data: { issuer, subject: randomUUID(), email: `${randomUUID()}@example.test`, name: `Visit ${role}` } }); users.push(user.id); const member = await db.membership.create({ data: { organizationId: org, userId: user.id, role } }); const token = randomBytes(32).toString('base64url'); const csrf = randomBytes(32).toString('base64url'); await db.authSession.create({ data: { tokenHash: hashToken(token), csrfToken: csrf, userId: user.id, activeOrganizationId: org, expiresAt: new Date(Date.now() + 900000) } }); return { cookie: `sg_session=${token}`, csrf, membershipId: member.id }; }
function call(method: 'get' | 'post' | 'put' | 'patch', path: string, actor = dispatcher) { return request(app)[method](`/api/v1${path}`).set('Cookie', actor.cookie).set('Origin', origin).set('X-CSRF-Token', actor.csrf).set('X-Organization-Id', org); }
const version = async (row: Job) => (await db.job.findUniqueOrThrow({ where: { id: row.id } })).version;
async function job(start = '09:00') {
  const row = await db.job.create({ data: { organizationId: org, customerId, siteId, equipmentId, status: 'TRIAGED', complaint: 'Fictional visit fixture', arrivalStart: date(start), arrivalEnd: date('18:00'), plannedStart: date(start), partsReviewed: true, prerequisitesReviewed: true, estimatedDurationMinutes: 60, travelBufferMinutes: 30 } });
  await db.jobScheduling.create({ data: { organizationId: org, jobId: row.id, branchId, generalInspection: true } });
  const requirement = await db.jobPart.create({ data: { organizationId: org, jobId: row.id, partId, locationId, state: 'REQUIRED', quantity: '1.250', reason: 'Fictional required part' } });
  await db.partConfirmation.create({ data: { organizationId: org, jobPartId: requirement.id, recordedJobVersion: 1, requirementRevision: 1, visitRevision: 1, plannedStart: date(start), status: 'CONFIRMED', note: 'Fictional manual check', confirmedByMembershipId: owner.membershipId } });
  const prerequisite = await db.jobPrerequisite.create({ data: { organizationId: org, jobId: row.id, code: 'SAFE_ACCESS', kind: 'SAFETY', label: 'Safe access', rationale: 'Fictional safety policy' } });
  await db.prerequisiteEvidence.create({ data: { organizationId: org, prerequisiteId: prerequisite.id, recordedJobVersion: 1, visitRevision: 1, plannedStart: date(start), status: 'PASS', note: 'Fictional check', verifiedByMembershipId: owner.membershipId } }); return row;
}
async function assign(row: Job) { await call('post', `/preparation/${row.id}/ready`).send({ version: await version(row) }).expect(200); const response = await call('post', `/preparation/${row.id}/assignments`).set('Idempotency-Key', randomUUID()).send({ version: await version(row), technicianId: techId, approvalReason: 'Fictional approved visit' }).expect(201); return response.body.assignmentId as string; }
async function invoke(row: Job, id: string, operation: string, extra: object = {}, actor = technician, key = randomUUID()) { return call('post', `/visits/${row.id}/${operation}`, actor).set('Idempotency-Key', key).send({ version: await version(row), assignmentId: id, ...extra }); }
async function started(row: Job, id: string) { expect((await invoke(row, id, 'acknowledge')).status).toBe(200); expect((await invoke(row, id, 'start')).status).toBe(200); }
const resolved = { outcome: 'RESOLVED', notes: 'Fictional successful resolution', followUpReason: null, followUpWindow: null };
const followUp = { outcome: 'FOLLOW_UP_REQUIRED', notes: 'Fictional additional part required', followUpReason: 'PARTS', followUpWindow: { arrivalStart: '2030-02-02T09:00:00Z', arrivalEnd: '2030-02-02T12:00:00Z' } };
async function clearVisits() { const where = { organizationId: org }; await db.outboxEvent.deleteMany({ where }); await db.idempotencyRecord.deleteMany({ where }); const observations = await db.visitObservation.findMany({ where, orderBy: { recordedJobVersion: 'desc' } }); for (const row of observations) await db.visitObservation.delete({ where: { id: row.id } }); await db.visitClosure.deleteMany({ where }); await db.assignment.deleteMany({ where }); await db.appointmentReservation.deleteMany({ where }); }
beforeAll(async () => {
  await db.organization.createMany({ data: [org, foreign].map((id) => ({ id, slug: `visits-${id}`, name: `Visits ${id}` })) }); owner = await identity('OWNER'); dispatcher = await identity('DISPATCHER'); technician = await identity('TECHNICIAN'); otherTech = await identity('TECHNICIAN');
  branchId = (await db.branch.create({ data: { organizationId: org, name: 'Main', nameKey: 'main', address: 'Fictional' } })).id; partId = (await db.part.create({ data: { organizationId: org, sku: 'TEST', name: 'Fictional filter', unit: 'each' } })).id; locationId = (await db.stockLocation.create({ data: { organizationId: org, branchId, name: 'Stores', kind: 'BRANCH' } })).id;
  techId = (await db.technician.create({ data: { organizationId: org, membershipId: technician.membershipId, branchId } })).id; await db.technician.create({ data: { organizationId: org, membershipId: otherTech.membershipId, branchId } }); await db.availability.create({ data: { organizationId: org, technicianId: techId, kind: 'SHIFT', startsAt: date('08:00'), endsAt: date('19:00'), reason: 'Fictional shift' } });
  customerId = (await db.customer.create({ data: { organizationId: org, name: 'Fictional visit customer' } })).id; siteId = (await db.serviceSite.create({ data: { organizationId: org, customerId, name: 'Kitchen', address: 'Fictional address' } })).id; equipmentId = (await db.equipment.create({ data: { organizationId: org, siteId, manufacturer: 'Demo', model: 'Demo', serialNumber: 'TEST' } })).id;
});
afterEach(clearVisits);
afterAll(async () => {
  await clearVisits(); const scope = { organizationId: { in: [org, foreign] } };
  await db.partConfirmation.deleteMany({ where: scope }); await db.prerequisiteEvidence.deleteMany({ where: scope }); await db.jobPart.deleteMany({ where: scope }); await db.jobPrerequisite.deleteMany({ where: scope }); await db.jobSkillRequirement.deleteMany({ where: scope }); await db.jobScheduling.deleteMany({ where: scope }); await db.jobEvent.deleteMany({ where: scope }); await db.auditEvent.deleteMany({ where: scope });
  const followUps = await db.job.findMany({ where: { ...scope, jobType: 'FOLLOW_UP' }, orderBy: { createdAt: 'desc' } }); for (const row of followUps) await db.job.delete({ where: { id: row.id } }); await db.job.deleteMany({ where: scope });
  await db.equipment.deleteMany({ where: scope }); await db.serviceSite.deleteMany({ where: scope }); await db.customer.deleteMany({ where: scope }); await db.availability.deleteMany({ where: scope }); await db.technician.deleteMany({ where: scope }); await db.stockLocation.deleteMany({ where: scope }); await db.part.deleteMany({ where: scope }); await db.branch.deleteMany({ where: scope }); await db.authSession.deleteMany({ where: { userId: { in: users } } }); await db.membership.deleteMany({ where: scope }); await db.user.deleteMany({ where: { id: { in: users } } }); await db.organization.deleteMany({ where: { id: { in: [org, foreign] } } }); await db.$disconnect();
});
describe('visit execution, permissions and atomic follow-ups', () => {
  it('scopes technician lists/cards to the assigned person and excludes global directory data', async () => {
    const row = await job(); const id = await assign(row);
    await request(app).get('/api/v1/my-assignments').expect(401); expect((await call('get', '/my-assignments', technician)).body.items.map((item: { assignmentId: string }) => item.assignmentId)).toEqual([id]); expect((await call('get', '/my-assignments', otherTech)).body.items).toEqual([]);
    await call('get', `/my-assignments/${id}`, otherTech).expect(404); await call('get', `/my-assignments/${id}`, technician).set('X-Organization-Id', foreign).expect(404); await call('get', `/visits/jobs/${row.id}`, technician).expect(403);
    const card = await call('get', `/my-assignments/${id}`, technician).expect(200); expect(card.body.approvalReadiness.manualPartsNotice).toContain('not reserved'); expect(JSON.stringify(card.body)).not.toContain(issuer);
  });
  it('enforces ordered transitions, assigned-technician actions, CSRF and stale versions', async () => {
    const row = await job(); const id = await assign(row);
    expect((await invoke(row, id, 'start')).status).toBe(409); expect((await invoke(row, id, 'acknowledge', {}, dispatcher)).status).toBe(403); expect((await invoke(row, id, 'acknowledge', {}, otherTech)).status).toBe(404);
    await call('post', `/visits/${row.id}/acknowledge`, technician).set('Origin', 'https://other.example').set('Idempotency-Key', randomUUID()).send({ version: await version(row), assignmentId: id }).expect(403);
    const v = await version(row); expect((await invoke(row, id, 'acknowledge')).status).toBe(200); await call('post', `/visits/${row.id}/start`, technician).set('Idempotency-Key', randomUUID()).send({ version: v, assignmentId: id }).expect(409); expect((await invoke(row, id, 'start')).status).toBe(200);
  });
  it('replays an acknowledged action without another event and rejects changed-key payloads', async () => {
    const row = await job(); const id = await assign(row); const key = randomUUID(); const body = { version: await version(row), assignmentId: id };
    const first = await call('post', `/visits/${row.id}/acknowledge`, technician).set('Idempotency-Key', key).send(body).expect(200); const replay = await call('post', `/visits/${row.id}/acknowledge`, technician).set('Idempotency-Key', key).send(body).expect(200); expect(replay.body).toEqual(first.body);
    expect(await db.jobEvent.count({ where: { jobId: row.id, kind: 'VISIT_ACKNOWLEDGED' } })).toBe(1); await call('post', `/visits/${row.id}/start`, technician).set('Idempotency-Key', key).send({ ...body, version: await version(row) }).expect(409);
  });
  it('records non-accounting usage and append-only corrections without rewriting original notes', async () => {
    const row = await job(); const id = await assign(row); await started(row, id);
    const usage = await invoke(row, id, 'observations', { kind: 'PART_USAGE', note: 'Fictional reported filter use', partId, partLabel: null, quantity: '1.250', correctsId: null }); expect(usage.status).toBe(201);
    const original = await db.visitObservation.findUniqueOrThrow({ where: { id: usage.body.observationId as string } });
    expect((await invoke(row, id, 'observations', { kind: 'CORRECTION', note: 'Correction: reported quantity was one', partId: null, partLabel: null, quantity: null, correctsId: original.id })).status).toBe(201); expect((await db.visitObservation.findUniqueOrThrow({ where: { id: original.id } })).quantity?.toString()).toBe('1.25');
    expect(await db.visitObservation.count({ where: { jobId: row.id } })).toBe(2);
  });
  it('closes resolved visits atomically, releases capacity and feeds resolved asset familiarity', async () => {
    const row = await job(); const id = await assign(row); await started(row, id); const response = await invoke(row, id, 'close', resolved); expect(response.status).toBe(200); expect(response.body.followUpJobId).toBeNull();
    expect(await db.assignment.findUnique({ where: { id } })).toMatchObject({ active: false, releaseKind: 'CLOSED', resolvedAt: expect.any(Date) }); expect(await db.appointmentReservation.count({ where: { jobId: row.id, active: true } })).toBe(0);
    const next = await job(); const ranked = await call('post', `/preparation/${next.id}/ranking`).send({ version: 1 }).expect(200); expect(ranked.body.candidates.find((candidate: { technicianId: string }) => candidate.technicianId === techId)).toMatchObject({ resolvedVisits: 1, assetFamiliarity: 25 });
    expect((await call('get', '/my-assignments?scope=HISTORY', technician)).body.items).toHaveLength(1);
  });
  it('creates exactly one linked follow-up with copied context but no evidence or assignment on duplicate closure', async () => {
    const row = await job(); const id = await assign(row); await started(row, id); const key = randomUUID(); const body = { version: await version(row), assignmentId: id, ...followUp };
    const first = await call('post', `/visits/${row.id}/close`, technician).set('Idempotency-Key', key).send(body).expect(200); const replay = await call('post', `/visits/${row.id}/close`, technician).set('Idempotency-Key', key).send(body).expect(200); expect(replay.body).toEqual(first.body);
    const child = await db.job.findUniqueOrThrow({ where: { id: first.body.followUpJobId as string }, include: { partRequirements: { include: { confirmations: true } }, prerequisites: { include: { evidence: true } }, assignments: true } });
    expect(child).toMatchObject({ jobType: 'FOLLOW_UP', parentJobId: row.id, rootJobId: row.id, status: 'DRAFT', plannedStart: null, partsReviewed: false, prerequisitesReviewed: false, readySnapshot: null }); expect(child.assignments).toHaveLength(0); expect(child.partRequirements[0]!.confirmations).toHaveLength(0); expect(child.prerequisites[0]!.evidence).toHaveLength(0); expect(await db.job.count({ where: { parentJobId: row.id } })).toBe(1);
  });
  it('permits only one simultaneous close and rejects incomplete closure without partial release', async () => {
    const row = await job(); const id = await assign(row); await started(row, id);
    expect((await invoke(row, id, 'close', { ...followUp, followUpReason: null })).status).toBe(400); expect(await db.assignment.findUnique({ where: { id } })).toMatchObject({ active: true }); expect(await db.visitClosure.count({ where: { jobId: row.id } })).toBe(0);
    const body = { version: await version(row), assignmentId: id, ...followUp };
    const results = await Promise.all([randomUUID(), randomUUID()].map((key) => call('post', `/visits/${row.id}/close`, technician).set('Idempotency-Key', key).send(body))); expect(results.map((result) => result.status).sort()).toEqual([200, 409]); expect(await db.job.count({ where: { parentJobId: row.id } })).toBe(1);
  });
  it('keeps the original root across further follow-ups and requires fresh preparation for the copied job', async () => {
    const original = await job(); const originalAssignment = await assign(original); await started(original, originalAssignment); const first = await invoke(original, originalAssignment, 'close', followUp); expect(first.status).toBe(200);
    const child = await db.job.findUniqueOrThrow({ where: { id: first.body.followUpJobId as string } });
    await call('post', `/preparation/${child.id}/ready`).send({ version: 1 }).expect(422);
    await db.availability.create({ data: { organizationId: org, technicianId: techId, kind: 'SHIFT', startsAt: new Date('2030-02-02T08:00:00Z'), endsAt: new Date('2030-02-02T18:00:00Z'), reason: 'Fictional second visit shift' } });
    await call('post', `/jobs/${child.id}/transitions`).send({ version: 1, status: 'TRIAGED', reason: '' }).expect(200);
    await call('put', `/preparation/${child.id}`).send({ version: await version(child), plannedStart: child.arrivalStart.toISOString(), partsReviewed: true, prerequisitesReviewed: true }).expect(200);
    const copiedPart = await db.jobPart.findFirstOrThrow({ where: { jobId: child.id } }); const copiedPrerequisite = await db.jobPrerequisite.findFirstOrThrow({ where: { jobId: child.id } });
    await call('post', `/preparation/${child.id}/parts/${copiedPart.id}/confirmations`).send({ version: await version(child), status: 'CONFIRMED', note: 'Fresh second visit check' }).expect(201);
    await call('post', `/preparation/${child.id}/prerequisites/${copiedPrerequisite.id}/evidence`).send({ version: await version(child), status: 'PASS', note: 'Fresh second visit prerequisite' }).expect(201);
    const childAssignment = await assign(child); await started(child, childAssignment);
    const second = await invoke(child, childAssignment, 'close', { ...followUp, followUpWindow: { arrivalStart: '2030-02-03T09:00:00Z', arrivalEnd: '2030-02-03T12:00:00Z' } }); expect(second.status).toBe(200);
    expect(await db.job.findUnique({ where: { id: second.body.followUpJobId as string } })).toMatchObject({ parentJobId: child.id, rootJobId: original.id, jobType: 'FOLLOW_UP', status: 'DRAFT' });
  });
  it('reschedules by releasing time and invalidating all preparation, then rejects stale technician actions', async () => {
    const row = await job(); const id = await assign(row); expect((await invoke(row, id, 'reschedule', { reason: 'Customer changed window', arrivalStart: '2030-02-02T09:00:00Z', arrivalEnd: '2030-02-02T12:00:00Z', estimatedDurationMinutes: 90, travelBufferMinutes: 45 }, dispatcher)).status).toBe(200);
    expect(await db.job.findUnique({ where: { id: row.id } })).toMatchObject({ status: 'TRIAGED', plannedStart: null, partsReviewed: false, prerequisitesReviewed: false, visitRevision: 2 }); expect(await db.assignment.findUnique({ where: { id } })).toMatchObject({ active: false, releaseKind: 'RESCHEDULED' }); expect((await invoke(row, id, 'acknowledge')).status).toBe(404); await call('get', `/my-assignments/${id}`, technician).expect(404);
    expect((await call('get', `/preparation/${row.id}/readiness`)).body.status).toBe('BLOCKED');
  });
  it('cancels assigned or unassigned requests but never an in-progress visit', async () => {
    const row = await job(); const id = await assign(row); expect((await invoke(row, id, 'cancel', { reason: 'Customer cancelled' }, dispatcher)).status).toBe(200); expect(await db.assignment.findUnique({ where: { id } })).toMatchObject({ active: false, releaseKind: 'CANCELLED' });
    const unassigned = await job(); await call('post', `/visits/${unassigned.id}/cancel`).set('Idempotency-Key', randomUUID()).send({ version: 1, assignmentId: null, reason: 'No visit required' }).expect(200);
    const progress = await job(); const activeId = await assign(progress); await started(progress, activeId); expect((await invoke(progress, activeId, 'cancel', { reason: 'Invalid cancel' }, dispatcher)).status).toBe(409); expect((await invoke(progress, activeId, 'reschedule', { reason: 'Invalid', arrivalStart: '2030-02-02T09:00:00Z', arrivalEnd: '2030-02-02T12:00:00Z', estimatedDurationMinutes: 60, travelBufferMinutes: 30 }, dispatcher)).status).toBe(409);
  });
  it('prevents two planned visits for the same technician from both starting concurrently', async () => {
    const a = await job('09:00'); const b = await job('11:00'); const aid = await assign(a); const bid = await assign(b); await invoke(a, aid, 'acknowledge'); await invoke(b, bid, 'acknowledge');
    const results = await Promise.all([invoke(a, aid, 'start'), invoke(b, bid, 'start')]); expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
  });
  it('keeps closed outcomes immutable while permitting attributed annotations and revokes access immediately', async () => {
    const row = await job(); const id = await assign(row); await started(row, id); expect((await invoke(row, id, 'close', resolved, dispatcher)).status).toBe(200);
    expect((await invoke(row, id, 'observations', { kind: 'NOTE', note: 'Post-closure annotation', partId: null, partLabel: null, quantity: null, correctsId: null })).status).toBe(201); expect((await invoke(row, id, 'close', followUp)).status).toBe(409);
    await db.membership.update({ where: { id: technician.membershipId }, data: { active: false } }); try { await call('get', `/my-assignments/${id}`, technician).expect(404); } finally { await db.membership.update({ where: { id: technician.membershipId }, data: { active: true } }); }
    expect(await db.visitClosure.findUnique({ where: { jobId: row.id } })).toMatchObject({ outcome: 'RESOLVED', notes: resolved.notes });
  });
});
