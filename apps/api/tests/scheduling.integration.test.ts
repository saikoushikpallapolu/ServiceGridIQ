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
import { reserveEligibleSlot } from '../src/scheduling/service.js';

const db = createDatabase(process.env.DATABASE_URL!); const org = randomUUID(); const other = randomUUID();
const origin = 'http://localhost:8080'; const issuer = 'http://localhost:8082/realms/servicegrid';
const config = parseConfig({ DATABASE_URL: process.env.DATABASE_URL, AUTH_MODE: 'local', PUBLIC_ORIGIN: origin, OIDC_ISSUER: issuer, OIDC_CLIENT_ID: 'servicegrid-web' });
const provider: IdentityProvider = { authorize: async () => origin, redeem: async () => { throw new Error('unused'); }, logoutUrl: async () => origin };
const app = createApp({ checkDatabase: async () => {}, logLevel: 'silent', authRouter: createAuthRouter(db, config, provider) });
type Identity = { cookie: string; csrf: string; membershipId: string };
const userIds: string[] = []; let owner: Identity; let dispatcher: Identity; let techIdentity: Identity;
let branchId: string; let otherBranchId: string; let skillId: string; let otherSkillId: string; let techId: string; let foreignTechId: string; let siteId: string; let customerId: string; let equipmentId: string; let shiftId: string;
const date = (time: string) => new Date(`2030-01-01T${time}:00Z`);
async function identity(role: Role, organizationId = org) {
  const user = await db.user.create({ data: { issuer, subject: randomUUID(), email: `${randomUUID()}@example.test`, name: `Scheduling ${role}` } }); userIds.push(user.id);
  const membership = await db.membership.create({ data: { userId: user.id, organizationId, role } });
  const token = randomBytes(32).toString('base64url'); const csrf = randomBytes(32).toString('base64url');
  await db.authSession.create({ data: { tokenHash: hashToken(token), csrfToken: csrf, userId: user.id, activeOrganizationId: organizationId, expiresAt: new Date(Date.now() + 900_000) } });
  return { cookie: `sg_session=${token}`, csrf, membershipId: membership.id };
}
function call(method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string, actor = dispatcher) { return request(app)[method](`/api/v1${path}`).set('Cookie', actor.cookie).set('Origin', origin).set('X-CSRF-Token', actor.csrf).set('X-Organization-Id', org); }
const techVersion = async () => (await db.technician.findUniqueOrThrow({ where: { id: techId } })).version;
async function job() {
  const row = await db.job.create({ data: { organizationId: org, customerId, siteId, equipmentId, status: 'TRIAGED', complaint: 'Fictional scheduling test', priority: 'NORMAL', arrivalStart: date('09:00'), arrivalEnd: date('10:00'), estimatedDurationMinutes: 90, travelBufferMinutes: 30 } });
  const policy = await db.jobScheduling.create({ data: { organizationId: org, jobId: row.id, branchId } });
  await db.jobSkillRequirement.create({ data: { organizationId: org, schedulingId: policy.id, skillId, level: 2 } }); return row;
}
const preview = (row: Job, time = '09:00') => call('post', `/job-scheduling/${row.id}/eligibility`).send({ version: row.version, plannedStart: date(time).toISOString() });
const reserve = (row: Job, time = '09:00') => db.$transaction(async (tx) => { await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${org}::uuid FOR UPDATE`; return reserveEligibleSlot(tx, org, row.id, row.version, date(time), techId); });

beforeAll(async () => {
  await db.organization.createMany({ data: [org, other].map((id) => ({ id, slug: `scheduling-${id}`, name: `Scheduling ${id}` })) });
  owner = await identity('OWNER'); dispatcher = await identity('DISPATCHER'); techIdentity = await identity('TECHNICIAN'); const foreign = await identity('TECHNICIAN', other);
  branchId = (await db.branch.create({ data: { organizationId: org, name: 'Main', nameKey: 'main', address: 'Fictional main' } })).id;
  otherBranchId = (await db.branch.create({ data: { organizationId: other, name: 'Private', nameKey: 'private', address: 'Private' } })).id;
  skillId = (await db.skill.create({ data: { organizationId: org, name: 'Cooling', nameKey: 'cooling' } })).id;
  otherSkillId = (await db.skill.create({ data: { organizationId: other, name: 'Private', nameKey: 'private' } })).id;
  techId = (await db.technician.create({ data: { organizationId: org, membershipId: techIdentity.membershipId, branchId } })).id;
  foreignTechId = (await db.technician.create({ data: { organizationId: other, membershipId: foreign.membershipId, branchId: otherBranchId } })).id;
  await db.technicianSkill.create({ data: { organizationId: org, technicianId: techId, skillId, level: 2, verifiedByMembershipId: owner.membershipId, evidence: 'Fictional qualification' } });
  shiftId = (await db.availability.create({ data: { organizationId: org, technicianId: techId, kind: 'SHIFT', startsAt: date('08:00'), endsAt: date('12:00'), reason: 'Test shift' } })).id;
  customerId = (await db.customer.create({ data: { organizationId: org, name: 'Fictional scheduling customer' } })).id;
  siteId = (await db.serviceSite.create({ data: { organizationId: org, customerId, name: 'Kitchen', address: 'Fictional' } })).id;
  equipmentId = (await db.equipment.create({ data: { organizationId: org, siteId, manufacturer: 'Demo', model: 'Demo', serialNumber: 'TEST' } })).id;
});
afterEach(async () => { await db.appointmentReservation.deleteMany({ where: { organizationId: org } }); await db.availability.deleteMany({ where: { organizationId: org, id: { not: shiftId } } }); });
afterAll(async () => {
  const scope = { organizationId: { in: [org, other] } };
  await db.appointmentReservation.deleteMany({ where: scope }); await db.availability.deleteMany({ where: scope }); await db.technicianSkill.deleteMany({ where: scope }); await db.technician.deleteMany({ where: scope });
  await db.jobSkillRequirement.deleteMany({ where: scope }); await db.jobScheduling.deleteMany({ where: scope }); await db.jobEvent.deleteMany({ where: scope }); await db.auditEvent.deleteMany({ where: scope }); await db.job.deleteMany({ where: scope });
  await db.equipment.deleteMany({ where: scope }); await db.serviceSite.deleteMany({ where: scope }); await db.customer.deleteMany({ where: scope }); await db.skill.deleteMany({ where: scope }); await db.branch.deleteMany({ where: scope });
  await db.authSession.deleteMany({ where: { userId: { in: userIds } } }); await db.membership.deleteMany({ where: scope }); await db.user.deleteMany({ where: { id: { in: userIds } } }); await db.organization.deleteMany({ where: { id: { in: [org, other] } } }); await db.$disconnect();
});

describe('scheduling authorization and reservation invariants', () => {
  it('protects scheduling collections, owner verification and CSRF', async () => {
    for (const path of ['/branches', '/skills', '/technicians', '/technician-memberships']) { await request(app).get(`/api/v1${path}`).expect(401); await call('get', path, techIdentity).expect(403); }
    await call('post', '/branches').send({ name: 'Forbidden', address: 'Forbidden' }).expect(403);
    await call('put', `/technicians/${techId}/skills/${skillId}`).send({ version: 1, level: 3, active: true, expiresAt: null, evidence: 'Forged' }).expect(403);
    await call('post', `/technicians/${techId}/availability`).set('Origin', 'https://attacker.example').send({}).expect(403);
  });
  it('rejects foreign branches, technician IDs and skills at API and database layers', async () => {
    await call('patch', `/technicians/${foreignTechId}`, owner).send({ version: 1, branchId, active: true, safetyRestricted: false }).expect(404);
    await call('put', `/technicians/${techId}/skills/${otherSkillId}`, owner).send({ version: await techVersion(), level: 2, active: true, expiresAt: null, evidence: 'Bad' }).expect(404);
    const row = await job(); await call('put', `/job-scheduling/${row.id}`).send({ version: row.version, branchId: otherBranchId, allowCrossBranch: false, generalInspection: true, requirements: [] }).expect(404);
    await expect(db.availability.create({ data: { organizationId: org, technicianId: foreignTechId, kind: 'SHIFT', startsAt: date('08:00'), endsAt: date('12:00'), reason: 'Bad' } })).rejects.toThrow();
    expect((await call('get', '/technicians').expect(200)).body.items.map((item: { id: string }) => item.id)).toEqual([techId]);
  });
  it('records owner verification evidence and rejects stale technician versions', async () => {
    const version = await techVersion();
    await call('put', `/technicians/${techId}/skills/${skillId}`, owner).send({ version, level: 2, expiresAt: '2031-01-01T00:00:00Z', evidence: 'Owner reviewed fictional evidence', active: true }).expect(200);
    await call('put', `/technicians/${techId}/skills/${skillId}`, owner).send({ version, level: 3, expiresAt: null, evidence: 'Stale', active: true }).expect(409);
    expect(await db.technicianSkill.findUnique({ where: { organizationId_technicianId_skillId: { organizationId: org, technicianId: techId, skillId } } })).toMatchObject({ verifiedByMembershipId: owner.membershipId, evidence: 'Owner reviewed fictional evidence' });
  });
  it('checks arrival bounds, versions, state and explicit qualification policy', async () => {
    const row = await job(); const response = await preview(row).expect(200);
    expect(response.body.appointment).toMatchObject({ reservedFrom: date('08:30').toISOString(), endsAt: date('10:30').toISOString() }); expect(response.body.candidates[0].eligible).toBe(true);
    await preview(row, '10:00').expect(400); await preview(row, '08:59').expect(400);
    await call('post', `/job-scheduling/${row.id}/eligibility`).send({ version: 99, plannedStart: date('09:00').toISOString() }).expect(409);
    await db.job.update({ where: { id: row.id }, data: { status: 'DRAFT' } }); await preview(row).expect(409);
    await call('put', `/job-scheduling/${row.id}`).send({ version: row.version, branchId, allowCrossBranch: false, generalInspection: false, requirements: [] }).expect(400);
    const changed = await call('put', `/job-scheduling/${row.id}`).send({ version: row.version, branchId, allowCrossBranch: false, generalInspection: true, requirements: [] }).expect(200);
    expect(changed.body.jobVersion).toBe(2); expect(await db.jobEvent.count({ where: { jobId: row.id, kind: 'SCHEDULING_POLICY_UPDATED' } })).toBe(1);
  });
  it('explains unavailability and expired evidence and denies technician self-verification', async () => {
    const row = await job();
    await db.availability.create({ data: { organizationId: org, technicianId: techId, kind: 'UNAVAILABLE', startsAt: date('08:45'), endsAt: date('09:00'), reason: 'Appointment' } });
    const skill = await db.technicianSkill.findUniqueOrThrow({ where: { organizationId_technicianId_skillId: { organizationId: org, technicianId: techId, skillId } } });
    await db.technicianSkill.update({ where: { id: skill.id }, data: { expiresAt: date('10:00') } });
    const result = await preview(row).expect(200); expect(result.body.candidates[0].checks.filter((item: { passed: boolean }) => !item.passed).map((item: { code: string }) => item.code)).toEqual(['QUALIFICATIONS', 'UNAVAILABLE', `SKILL:${skillId}`]);
    await db.technicianSkill.update({ where: { id: skill.id }, data: { expiresAt: null } });
    await call('put', `/technicians/${techId}/skills/${skillId}`, techIdentity).send({}).expect(403);
  });
  it('prevents simultaneous overlapping reservations while allowing adjacent reservations', async () => {
    const a = await job(); const b = await job();
    const results = await Promise.allSettled([reserve(a), reserve(b)]); expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect(await db.appointmentReservation.count({ where: { organizationId: org, active: true } })).toBe(1);
    await db.appointmentReservation.deleteMany({ where: { organizationId: org } });
    await db.appointmentReservation.create({ data: { organizationId: org, technicianId: techId, jobId: a.id, reservedFrom: date('08:00'), plannedStart: date('08:00'), endsAt: date('08:30') } });
    await reserve(b); expect(await db.appointmentReservation.count({ where: { organizationId: org } })).toBe(2);
  });
  it('enforces exclusion and one-active-job constraints even for concurrent direct writes', async () => {
    const a = await job(); const b = await job();
    const data = { organizationId: org, technicianId: techId, reservedFrom: date('08:30'), plannedStart: date('09:00'), endsAt: date('10:30') };
    const results = await Promise.allSettled([a, b].map((row) => db.appointmentReservation.create({ data: { ...data, jobId: row.id } })));
    expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    const booked = await db.appointmentReservation.findFirstOrThrow({ where: { organizationId: org } });
    await expect(db.appointmentReservation.create({ data: { ...data, jobId: booked.jobId, reservedFrom: date('11:00'), plannedStart: date('11:00'), endsAt: date('12:00') } })).rejects.toThrow();
  });
  it('serializes unavailability against reservation creation and prevents removing a covering shift', async () => {
    const row = await job(); const version = await techVersion();
    const results = await Promise.allSettled([reserve(row), call('post', `/technicians/${techId}/availability`).send({ version, kind: 'UNAVAILABLE', startsAt: date('09:00').toISOString(), endsAt: date('09:15').toISOString(), reason: 'Concurrent absence' })]);
    const booked = await db.appointmentReservation.count({ where: { organizationId: org } }); const blocked = await db.availability.count({ where: { organizationId: org, kind: 'UNAVAILABLE' } });
    expect(booked + blocked).toBe(1); expect(results).toHaveLength(2);
    await db.availability.deleteMany({ where: { organizationId: org, kind: 'UNAVAILABLE' } }); if (!booked) await reserve(row);
    await call('delete', `/technicians/${techId}/availability/${shiftId}`).send({ version: await techVersion() }).expect(409);
    await call('post', `/jobs/${row.id}/transitions`).send({ version: row.version, status: 'DRAFT', reason: 'Bypass' }).expect(409);
    await call('put', `/job-scheduling/${row.id}`).send({ version: row.version, branchId, allowCrossBranch: true, generalInspection: true, requirements: [] }).expect(409);
  });
  it('allows reservation release to free time and denies inactive membership eligibility', async () => {
    const a = await job(); const b = await job(); const reservation = await reserve(a);
    await db.appointmentReservation.update({ where: { id: reservation.id }, data: { active: false } }); await reserve(b);
    await db.appointmentReservation.deleteMany({ where: { organizationId: org } });
    await db.membership.update({ where: { id: techIdentity.membershipId }, data: { active: false } });
    try { const response = await preview(b).expect(200); expect(response.body.candidates[0].eligible).toBe(false); expect(response.body.candidates[0].checks[0].passed).toBe(false); } finally { await db.membership.update({ where: { id: techIdentity.membershipId }, data: { active: true } }); }
  });
  it('does not commit a reservation and removal of its covering shift in a race', async () => {
    const row = await job(); const version = await techVersion();
    await Promise.allSettled([reserve(row), call('delete', `/technicians/${techId}/availability/${shiftId}`).send({ version })]);
    const booked = await db.appointmentReservation.count({ where: { organizationId: org } });
    const shift = await db.availability.findUnique({ where: { id: shiftId } });
    expect(booked + (shift ? 0 : 1)).toBe(1);
    if (!shift) await db.availability.create({ data: { id: shiftId, organizationId: org, technicianId: techId, kind: 'SHIFT', startsAt: date('08:00'), endsAt: date('12:00'), reason: 'Restored test shift' } });
  });
  it('validates availability bounds and rejects duplicate same-type intervals', async () => {
    await call('post', `/technicians/${techId}/availability`).send({ version: await techVersion(), kind: 'SHIFT', startsAt: date('09:00').toISOString(), endsAt: date('10:00').toISOString(), reason: 'Overlap' }).expect(409);
    await call('post', `/technicians/${techId}/availability`).send({ version: await techVersion(), kind: 'SHIFT', startsAt: date('13:00').toISOString(), endsAt: date('12:00').toISOString(), reason: 'Invalid' }).expect(400);
    await expect(db.availability.create({ data: { organizationId: org, technicianId: techId, kind: 'SHIFT', startsAt: date('09:00'), endsAt: date('10:00'), reason: 'Direct overlap' } })).rejects.toThrow();
  });
  it('creates catalog records and profiles only for valid technician memberships', async () => {
    const branch = (await call('post', '/branches', owner).send({ name: 'Fictional Workshop', address: '42 Fictional Road' }).expect(201)).body as { id: string };
    await call('post', '/branches', owner).send({ name: 'fictional workshop', address: 'Duplicate' }).expect(409);
    await call('post', '/skills', owner).send({ name: 'Electrical diagnostics' }).expect(201);
    await call('post', '/skills', owner).send({ name: 'electrical diagnostics' }).expect(409);
    await call('post', '/technicians', owner).send({ membershipId: dispatcher.membershipId, branchId: branch.id }).expect(404);
    const member = await identity('TECHNICIAN');
    const created = await call('post', '/technicians', owner).send({ membershipId: member.membershipId, branchId: branch.id }).expect(201);
    expect(created.body).toMatchObject({ active: true, safetyRestricted: false, version: 1 });
    await call('post', '/technicians', owner).send({ membershipId: member.membershipId, branchId: branch.id }).expect(409);
    expect(await db.auditEvent.count({ where: { organizationId: org, targetId: created.body.id, action: 'TECHNICIAN_CREATED' } })).toBe(1);
  });
  it('limits a verified user without exhausting another user behind the same proxy', async () => {
    const limited = await identity('DISPATCHER');
    for (let index = 0; index < 300; index++) await request(app).get('/api/auth/session').set('Cookie', limited.cookie).expect(200);
    await request(app).get('/api/auth/session').set('Cookie', limited.cookie).expect(429);
    await call('get', '/branches', dispatcher).expect(200);
  }, 20000);
});
