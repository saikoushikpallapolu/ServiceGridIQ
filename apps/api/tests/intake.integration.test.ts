import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createDatabase } from '../src/database.js';
import { createApp } from '../src/app.js';
import { parseConfig } from '../src/config.js';
import { createAuthRouter, hashToken } from '../src/auth/router.js';
import type { IdentityProvider } from '../src/auth/oidc.js';
import type { Customer, ServiceSite, Equipment, Job, Role } from '@prisma/client';

const db = createDatabase(process.env.DATABASE_URL!);
const origin = 'http://localhost:8080'; const issuer = 'http://localhost:8082/realms/servicegrid';
const config = parseConfig({ DATABASE_URL: process.env.DATABASE_URL, AUTH_MODE: 'local', PUBLIC_ORIGIN: origin, OIDC_ISSUER: issuer, OIDC_CLIENT_ID: 'servicegrid-web' });
const provider: IdentityProvider = { authorize: async () => origin, redeem: async () => { throw new Error('unused'); }, logoutUrl: async () => origin };
const app = createApp({ checkDatabase: async () => {}, logLevel: 'silent', authRouter: createAuthRouter(db, config, provider) });
const org = randomUUID(); const foreignOrg = randomUUID(); const userIds: string[] = [];
type Identity = { cookie: string; csrf: string; membershipId: string };
let owner: Identity; let dispatcher: Identity; let technician: Identity;
let customer: Customer; let site: ServiceSite; let equipment: Equipment; let foreignCustomer: Customer; let foreignSite: ServiceSite; let foreignEquipment: Equipment;
const random = () => randomBytes(32).toString('base64url');
async function identity(role: Role) {
  const user = await db.user.create({ data: { issuer, subject: randomUUID(), email: `${randomUUID()}@example.test`, name: `Test ${role}` } }); userIds.push(user.id);
  const membership = await db.membership.create({ data: { organizationId: org, userId: user.id, role } });
  const token = random(); const csrf = random();
  await db.authSession.create({ data: { tokenHash: hashToken(token), csrfToken: csrf, userId: user.id, activeOrganizationId: org, expiresAt: new Date(Date.now() + 900_000) } });
  return { cookie: `sg_session=${token}`, csrf, membershipId: membership.id };
}
function call(method: 'get' | 'post' | 'patch', path: string, actor = dispatcher) {
  return request(app)[method](`/api/v1${path}`).set('Cookie', actor.cookie).set('X-Organization-Id', org).set('Origin', origin).set('X-CSRF-Token', actor.csrf);
}
const input = () => ({ customerId: customer.id, siteId: site.id, equipmentId: equipment.id, complaint: 'Cooling drops out intermittently', priority: 'HIGH', arrivalStart: '2026-12-01T09:00:00+05:30', arrivalEnd: '2026-12-01T12:00:00+05:30', estimatedDurationMinutes: 90, travelBufferMinutes: 30 });
async function createJob() { return (await call('post', '/jobs').send(input()).expect(201)).body as Job; }

beforeAll(async () => {
  await db.organization.createMany({ data: [org, foreignOrg].map((id) => ({ id, slug: `intake-${id}`, name: `Test ${id}` })) });
  owner = await identity('OWNER'); dispatcher = await identity('DISPATCHER'); technician = await identity('TECHNICIAN');
  customer = await db.customer.create({ data: { organizationId: org, name: 'Fictional Bakery' } });
  site = await db.serviceSite.create({ data: { organizationId: org, customerId: customer.id, name: 'Kitchen', address: 'Fictional street' } });
  equipment = await db.equipment.create({ data: { organizationId: org, siteId: site.id, manufacturer: 'Demo', model: 'Cool', serialNumber: 'ALPHA-1' } });
  foreignCustomer = await db.customer.create({ data: { organizationId: foreignOrg, name: 'Private Beta' } });
  foreignSite = await db.serviceSite.create({ data: { organizationId: foreignOrg, customerId: foreignCustomer.id, name: 'Private', address: 'Private' } });
  foreignEquipment = await db.equipment.create({ data: { organizationId: foreignOrg, siteId: foreignSite.id, manufacturer: 'Private', model: 'Private', serialNumber: 'PRIVATE-BETA' } });
});
afterAll(async () => {
  const scope = { organizationId: { in: [org, foreignOrg] } };
  await db.jobEvent.deleteMany({ where: scope }); await db.auditEvent.deleteMany({ where: scope }); await db.job.deleteMany({ where: scope });
  await db.equipment.deleteMany({ where: scope }); await db.serviceSite.deleteMany({ where: scope }); await db.customer.deleteMany({ where: scope });
  await db.authSession.deleteMany({ where: { userId: { in: userIds } } }); await db.membership.deleteMany({ where: scope }); await db.user.deleteMany({ where: { id: { in: userIds } } }); await db.organization.deleteMany({ where: { id: { in: [org, foreignOrg] } } }); await db.$disconnect();
});

describe('service intake boundaries and workflow', () => {
  it('requires a session, selected company and dispatcher permission for every intake collection', async () => {
    for (const path of ['/customers', '/sites', '/equipment', '/jobs']) {
      await request(app).get(`/api/v1${path}`).expect(401);
      await call('get', path, technician).expect(403);
      await call('post', path, technician).send({}).expect(403);
      await call('get', path).set('X-Organization-Id', foreignOrg).expect(404);
    }
  });
  it('creates and updates a customer, site and equipment with version checks and audit', async () => {
    const c = (await call('post', '/customers', owner).send({ name: '  Fictional Office  ', email: null, phone: '555-0100' }).expect(201)).body as Customer;
    expect(c.name).toBe('Fictional Office');
    const s = (await call('post', '/sites').send({ customerId: c.id, name: 'Roof', address: 'Fictional office roof', accessNotes: 'Ask reception' }).expect(201)).body as ServiceSite;
    const e = (await call('post', '/equipment').send({ siteId: s.id, manufacturer: 'Demo', model: 'Roof', serialNumber: 'R1', notes: 'Fictional' }).expect(201)).body as Equipment;
    await call('patch', `/customers/${c.id}`).send({ name: 'Updated Office', email: null, phone: null, version: 1 }).expect(200);
    await call('patch', `/customers/${c.id}`).send({ name: 'Stale', email: null, phone: null, version: 1 }).expect(409);
    await call('patch', `/sites/${s.id}`).send({ name: 'Updated Roof', address: 'New address', accessNotes: '', version: 1 }).expect(200);
    await call('patch', `/equipment/${e.id}`).send({ manufacturer: 'Demo', model: 'Updated', serialNumber: 'R1', notes: '', version: 1 }).expect(200);
    expect(await db.auditEvent.count({ where: { organizationId: org, targetId: { in: [c.id, s.id, e.id] } } })).toBe(6);
  });
  it('blocks cross-company and mismatched parent relationships without partial records', async () => {
    const before = await db.job.count({ where: { organizationId: org } });
    await call('post', '/sites').send({ customerId: foreignCustomer.id, name: 'Invalid', address: 'Invalid', accessNotes: '' }).expect(404);
    await call('post', '/equipment').send({ siteId: foreignSite.id, manufacturer: 'Demo', model: 'Bad', serialNumber: 'Bad', notes: '' }).expect(404);
    await call('post', '/jobs').send({ ...input(), equipmentId: foreignEquipment.id }).expect(404);
    await call('post', '/jobs').send({ ...input(), customerId: foreignCustomer.id }).expect(404);
    expect(await db.job.count({ where: { organizationId: org } })).toBe(before);
    await expect(db.serviceSite.create({ data: { organizationId: org, customerId: foreignCustomer.id, name: 'Bad', address: 'Bad' } })).rejects.toThrow();
    await expect(db.job.create({ data: { ...input(), organizationId: org, equipmentId: foreignEquipment.id, priority: 'NORMAL' } })).rejects.toThrow();
    const otherCustomer = await db.customer.create({ data: { organizationId: org, name: 'Other same-company customer' } });
    const otherSite = await db.serviceSite.create({ data: { organizationId: org, customerId: otherCustomer.id, name: 'Other site', address: 'Other fictional street' } });
    await call('post', '/jobs').send({ ...input(), customerId: otherCustomer.id }).expect(404);
    await call('post', '/jobs').send({ ...input(), customerId: otherCustomer.id, siteId: otherSite.id }).expect(404);
    await expect(db.job.create({ data: { ...input(), organizationId: org, customerId: otherCustomer.id, priority: 'NORMAL' } })).rejects.toThrow();
  });
  it('rejects forged status/version/tenant fields, invalid windows and out-of-range estimates', async () => {
    for (const change of [{ status: 'TRIAGED' }, { organizationId: foreignOrg }, { version: 100 }, { complaint: '  ' }, { estimatedDurationMinutes: 0 }, { travelBufferMinutes: -1 }, { arrivalEnd: '2026-12-01T08:00:00+05:30' }, { arrivalEnd: '2026-12-20T08:00:00+05:30' }, { arrivalStart: '2026-12-01T09:00:00' }]) await call('post', '/jobs').send({ ...input(), ...change }).expect(400);
  });
  it('requires same-origin CSRF on all intake mutations', async () => {
    await call('post', '/jobs').set('X-CSRF-Token', 'bad').send(input()).expect(403);
    await call('post', '/customers').set('Origin', 'https://other.example').send({ name: 'Bad', email: null, phone: null }).expect(403);
  });
  it('creates a draft, shows normalized instants and equipment history, and triages atomically', async () => {
    const first = await createJob(); const second = await createJob();
    const result = await call('get', `/jobs/${second.id}`).expect(200);
    expect(result.body.arrivalStart).toBe('2026-12-01T03:30:00.000Z');
    expect(result.body.customer.name).toBe(customer.name);
    expect(result.body.equipmentHistory.some((job: Job) => job.id === first.id)).toBe(true);
    const transitioned = await call('post', `/jobs/${second.id}/transitions`).send({ version: 1, status: 'TRIAGED', reason: '' }).expect(200);
    expect(transitioned.body).toMatchObject({ status: 'TRIAGED', version: 2 });
    expect(await db.jobEvent.count({ where: { organizationId: org, jobId: second.id } })).toBe(2);
    expect(await db.auditEvent.count({ where: { organizationId: org, targetId: second.id } })).toBe(2);
    await call('patch', `/jobs/${second.id}`).send({ ...input(), version: 2, status: 'ASSIGNED' }).expect(400);
    await call('post', `/jobs/${second.id}/transitions`).send({ version: 2, status: 'DRAFT', reason: '' }).expect(409);
    await call('post', `/jobs/${second.id}/transitions`).send({ version: 2, status: 'DRAFT', reason: 'Customer corrected access information' }).expect(200);
    await call('patch', `/jobs/${second.id}`).send({ ...input(), complaint: 'Updated complaint', version: 3 }).expect(200);
    const final = await call('get', `/jobs/${second.id}`).expect(200);
    expect(final.body.timeline[0].kind).toBe('JOB_UPDATED');
    expect(final.body.timeline[1].note).toBe('Customer corrected access information');
  });
  it('allows exactly one simultaneous update and rejects stale transitions without extra audit', async () => {
    const job = await createJob();
    const responses = await Promise.all(['A', 'B'].map((complaint) => call('patch', `/jobs/${job.id}`).send({ ...input(), complaint, version: 1 })));
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    await call('post', `/jobs/${job.id}/transitions`).send({ version: 1, status: 'TRIAGED', reason: '' }).expect(409);
    expect(await db.jobEvent.count({ where: { organizationId: org, jobId: job.id } })).toBe(2);
  });
  it('scopes detail, master updates, lists, search and pagination to the company', async () => {
    const foreign = await db.job.create({ data: { ...input(), organizationId: foreignOrg, customerId: foreignCustomer.id, siteId: foreignSite.id, equipmentId: foreignEquipment.id, priority: 'URGENT', complaint: 'Private Beta complaint' } });
    await call('get', `/jobs/${foreign.id}`).expect(404);
    await call('patch', `/customers/${foreignCustomer.id}`).send({ version: 1, name: 'Stolen', email: null, phone: null }).expect(404);
    const search = await call('get', '/jobs?q=PRIVATE-BETA').expect(200); expect(search.body.total).toBe(0);
    const filtered = await call('get', '/jobs?status=DRAFT&priority=HIGH&limit=1').expect(200);
    expect(filtered.body.items).toHaveLength(1); expect(filtered.body.total).toBeGreaterThan(1);
    const next = await call('get', '/jobs?status=DRAFT&priority=HIGH&limit=1&page=2').expect(200);
    expect(next.body.items[0].id).not.toBe(filtered.body.items[0].id);
    const customers = await call('get', '/customers').expect(200); expect(customers.body.items.every((row: Customer) => row.organizationId === org)).toBe(true);
    await call('get', '/jobs?limit=101').expect(400); await call('get', '/jobs?page=0').expect(400);
  });
  it('rechecks revoked membership for mutations and reads', async () => {
    await db.membership.update({ where: { id: dispatcher.membershipId }, data: { active: false } });
    try { await call('post', '/jobs').send(input()).expect(404); await call('get', '/jobs').expect(404); }
    finally { await db.membership.update({ where: { id: dispatcher.membershipId }, data: { active: true } }); }
  });
  it('enforces duration and arrival constraints even for direct database writes', async () => {
    await expect(db.job.create({ data: { ...input(), organizationId: org, priority: 'NORMAL', estimatedDurationMinutes: -1 } })).rejects.toThrow();
    await expect(db.job.create({ data: { ...input(), organizationId: org, priority: 'NORMAL', arrivalEnd: input().arrivalStart } })).rejects.toThrow();
  });
});
