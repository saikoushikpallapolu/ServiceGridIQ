import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createDatabase } from '../src/database.js';
import { parseConfig } from '../src/config.js';
import { createApp } from '../src/app.js';
import { createAuthRouter, hashToken } from '../src/auth/router.js';
import type { IdentityProvider } from '../src/auth/oidc.js';
import type { Role } from '@prisma/client';

const origin = 'http://localhost:8080';
const issuer = 'http://localhost:8082/realms/servicegrid';
const database = createDatabase(process.env.DATABASE_URL!);
const config = parseConfig({ DATABASE_URL: process.env.DATABASE_URL, AUTH_MODE: 'local', PUBLIC_ORIGIN: origin, OIDC_ISSUER: issuer, OIDC_CLIENT_ID: 'servicegrid-web' });
const orgA = randomUUID(); const orgB = randomUUID();
const createdUsers: string[] = [];
const nonce = () => randomBytes(32).toString('base64url');
let ownerId: string; let ownerMembershipId: string; let techId: string; let techMembershipId: string; let betaMembershipId: string;
const provider: IdentityProvider = {
  authorize: async (state) => `${issuer}/protocol/openid-connect/auth?state=${state}`,
  redeem: async () => ({ issuer, subject: 'callback-' + orgA, email: 'callback@example.test', name: 'Callback test', expiresAt: new Date(Date.now() + 900_000) }),
  logoutUrl: async () => origin,
};
const app = createApp({ checkDatabase: async () => {}, logLevel: 'silent', authRouter: createAuthRouter(database, config, provider) });

async function user(email: string) {
  const row = await database.user.create({ data: { issuer, subject: randomUUID(), email, name: email } });
  createdUsers.push(row.id); return row;
}
async function session(userId: string, organizationId: string | null = orgA, expiresAt = new Date(Date.now() + 900_000)) {
  const token = nonce(); const csrf = nonce();
  await database.authSession.create({ data: { tokenHash: hashToken(token), csrfToken: csrf, userId, activeOrganizationId: organizationId, expiresAt } });
  return { cookie: `sg_session=${token}`, token, csrf };
}
function get(path: string, identity: Awaited<ReturnType<typeof session>>, organizationId = orgA) {
  return request(app).get(path).set('Cookie', identity.cookie).set('X-Organization-Id', organizationId);
}
function post(path: string, identity: Awaited<ReturnType<typeof session>>, organizationId = orgA) {
  return request(app).post(path).set('Cookie', identity.cookie).set('X-Organization-Id', organizationId).set('Origin', origin).set('X-CSRF-Token', identity.csrf);
}
async function membership(userId: string, organizationId: string, role: Role) {
  return database.membership.create({ data: { userId, organizationId, role } });
}
beforeAll(async () => {
  await database.organization.createMany({ data: [orgA, orgB].map((id) => ({ id, slug: `isolation-${id}`, name: `Isolation ${id}` })) });
  ownerId = (await user(`owner-${orgA}@example.test`)).id;
  techId = (await user(`tech-${orgA}@example.test`)).id;
  ownerMembershipId = (await membership(ownerId, orgA, 'OWNER')).id;
  await membership(ownerId, orgB, 'DISPATCHER');
  techMembershipId = (await membership(techId, orgA, 'TECHNICIAN')).id;
  betaMembershipId = (await membership((await user(`beta-${orgA}@example.test`)).id, orgB, 'OWNER')).id;
});
afterAll(async () => {
  const callback = await database.user.findUnique({ where: { issuer_subject: { issuer, subject: 'callback-' + orgA } } });
  if (callback) createdUsers.push(callback.id);
  await database.auditEvent.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await database.invitation.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await database.authSession.deleteMany({ where: { userId: { in: createdUsers } } });
  await database.membership.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await database.user.deleteMany({ where: { id: { in: createdUsers } } });
  await database.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await database.$disconnect();
});

describe('authentication and tenant boundaries', () => {
  it('denies unauthenticated and forged-cookie access', async () => {
    await request(app).get('/api/v1/me/organizations').expect(401);
    await request(app).get('/api/v1/me/organizations').set('Cookie', `sg_session=${nonce()}`).expect(401);
    await request(app).get('/api/v1/me/organizations').set('Authorization', 'Bearer invented').expect(401);
  });
  it('lists only the signed-in user memberships', async () => {
    const result = await get('/api/v1/me/organizations', await session(techId));
    expect(result.status).toBe(200);
    expect(result.body.items.map((item: {id: string}) => item.id)).toEqual([orgA]);
  });
  it('blocks cross-tenant resource IDs and forged active organization headers', async () => {
    const owner = await session(ownerId);
    await get(`/api/v1/organizations/${orgA}`, owner).expect(200);
    await get(`/api/v1/organizations/${orgB}`, owner).expect(404);
    await get('/api/v1/memberships', owner, orgB).expect(404);
    await get(`/api/v1/organizations/${orgB}`, await session(techId), orgB).expect(404);
  });
  it('rejects CSRF and foreign origins before mutation', async () => {
    const owner = await session(ownerId);
    await request(app).post('/api/v1/me/organization').set('Cookie', owner.cookie).send({ organizationId: orgA }).expect(403);
    await post('/api/v1/me/organization', owner).set('Origin', 'https://attacker.example').send({ organizationId: orgA }).expect(403);
    await post('/api/v1/me/organization', owner).set('X-CSRF-Token', 'é'.repeat(43)).send({ organizationId: orgA }).expect(403);
  });
  it('rotates the session on a verified organization switch and rejects the old cookie', async () => {
    const owner = await session(ownerId);
    const response = await post('/api/v1/me/organization', owner).send({ organizationId: orgB }).expect(200);
    expect(response.headers['set-cookie']?.[0]).toContain('HttpOnly');
    expect(response.headers['set-cookie']?.[0]).toContain('SameSite=Lax');
    await get('/api/v1/me/organizations', owner).expect(401);
    expect(await database.authSession.findUnique({ where: { tokenHash: owner.token } })).toBeNull();
  });
  it('does not allow switching to a company without membership or inventing a role', async () => {
    const tech = await session(techId);
    await post('/api/v1/me/organization', tech).send({ organizationId: orgB }).expect(404);
    await post('/api/v1/me/organization', tech).send({ organizationId: orgA, role: 'OWNER' }).expect(400);
  });
  it('denies owner-only listing and invitations to technicians and dispatchers', async () => {
    const tech = await session(techId);
    await get('/api/v1/memberships', tech).expect(403);
    await get('/api/v1/audit-events', tech).expect(403);
    await post('/api/v1/invitations', tech).send({ email: 'x@example.test', role: 'OWNER' }).expect(403);
    await get('/api/v1/memberships', await session(ownerId, orgB), orgB).expect(403);
  });
  it('scopes membership mutations and preserves the last active owner', async () => {
    const owner = await session(ownerId);
    const patch = (id: string, body: object) => request(app).patch(`/api/v1/memberships/${id}`).set('Cookie', owner.cookie).set('X-Organization-Id', orgA).set('Origin', origin).set('X-CSRF-Token', owner.csrf).send(body);
    await patch(betaMembershipId, { role: 'TECHNICIAN', active: false }).expect(404);
    const result = await patch(ownerMembershipId, { role: 'TECHNICIAN', active: true }).expect(409);
    expect(result.body.error.code).toBe('LAST_OWNER');
  });
  it('applies membership revocation to an existing session immediately', async () => {
    const tech = await session(techId);
    await get(`/api/v1/organizations/${orgA}`, tech).expect(200);
    await database.membership.update({ where: { id: techMembershipId }, data: { active: false } });
    try { await get(`/api/v1/organizations/${orgA}`, tech).expect(404); }
    finally { await database.membership.update({ where: { id: techMembershipId }, data: { active: true } }); }
  });
  it('expires sessions and revokes logout cookies on the server', async () => {
    await get('/api/auth/session', await session(ownerId, null, new Date(Date.now() - 1000))).expect(401);
    const owner = await session(ownerId);
    await post('/api/auth/logout', owner).expect(200);
    await get('/api/auth/session', owner).expect(401);
  });
  it('rejects login callback state mismatch and consumed callback replay', async () => {
    await request(app).get('/api/auth/callback?state=forged').expect(400);
    const start = await request(app).get('/api/auth/login').expect(302);
    const state = new URL(start.headers.location!).searchParams.get('state')!;
    const loginCookie = `sg_login=${state}`;
    await request(app).get(`/api/auth/callback?code=test&state=${state}`).set('Cookie', loginCookie).expect(302);
    await request(app).get(`/api/auth/callback?code=test&state=${state}`).set('Cookie', loginCookie).expect(400);
  });
  it('accepts a matching verified invitation only once and refuses a different account', async () => {
    const invited = await user(`invited-${orgA}@example.test`);
    const owner = await session(ownerId);
    const invitation = await post('/api/v1/invitations', owner).send({ email: invited.email, role: 'TECHNICIAN' }).expect(201);
    const token = new URLSearchParams(new URL(invitation.body.inviteUrl).hash.slice(1)).get('invite')!;
    await post('/api/v1/invitations/accept', await session(techId)).send({ token }).expect(404);
    const invitedSession = await session(invited.id, null);
    await post('/api/v1/invitations/accept', invitedSession).send({ token }).expect(200);
    await post('/api/v1/invitations/accept', invitedSession).send({ token }).expect(404);
    const record = await database.invitation.findUniqueOrThrow({ where: { id: invitation.body.id } });
    expect(record.tokenHash).not.toBe(token);
  });
  it('the database rejects an audit actor from another company', async () => {
    await expect(database.auditEvent.create({ data: { organizationId: orgA, actorMembershipId: betaMembershipId, action: 'INVALID', targetId: orgA, details: {} } })).rejects.toThrow();
  });
  it('audit reads never return another organization events', async () => {
    const response = await get('/api/v1/audit-events', await session(ownerId)).expect(200);
    const ids = response.body.items.map((item: { id: string }) => item.id);
    const wrong = await database.auditEvent.count({ where: { id: { in: ids }, organizationId: orgB } });
    expect(wrong).toBe(0);
    expect(response.text).not.toContain('tokenHash');
  });
  it('serializes competing owner changes so at least one owner remains', async () => {
    const other = await user(`other-owner-${orgA}@example.test`);
    const otherMembership = await membership(other.id, orgA, 'OWNER');
    const first = await session(ownerId); const second = await session(other.id);
    const demote = (identity: Awaited<ReturnType<typeof session>>, id: string) => request(app).patch(`/api/v1/memberships/${id}`).set('Cookie', identity.cookie).set('Origin', origin).set('X-CSRF-Token', identity.csrf).set('X-Organization-Id', orgA).send({ role: 'TECHNICIAN', active: true });
    try {
      const results = await Promise.all([demote(first, otherMembership.id), demote(second, ownerMembershipId)]);
      expect(results.filter((result) => result.status === 200)).toHaveLength(1);
      expect(await database.membership.count({ where: { organizationId: orgA, role: 'OWNER', active: true } })).toBe(1);
    } finally {
      await database.membership.update({ where: { id: ownerMembershipId }, data: { role: 'OWNER' } });
      await database.membership.update({ where: { id: otherMembership.id }, data: { role: 'TECHNICIAN' } });
    }
  });
});
