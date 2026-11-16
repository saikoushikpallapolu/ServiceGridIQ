import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Router, type Request, type Response, type RequestHandler } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import type { PrismaClient } from '@prisma/client';
import type { Config } from '../config.js';
import type { IdentityProvider } from './oidc.js';
import { AuthError, reject as fail } from './errors.js';
import { createCompanyService } from './company-service.js';
import { createIntakeRouter } from '../intake/router.js';
import { createSchedulingRouter } from '../scheduling/router.js';
import { createDispatchRouter } from '../dispatch/router.js';
import { createVisitRouter } from '../visits/router.js';
import { createOnboardingRouter } from '../onboarding/router.js';
import { createKnowledgeRouter } from '../knowledge/router.js';
import { createInventoryRouter } from '../inventory/router.js';
import type { KnowledgeDependencies } from '../knowledge/dependencies.js';
import { context, type Context } from './context.js';

const uuid = z.uuid();
const role = z.enum(['OWNER', 'DISPATCHER', 'TECHNICIAN']);
const random = () => randomBytes(32).toString('base64url');
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const equal = (left: string, right: string) => {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

function cookie(req: Request, name: string) {
  const values = (req.headers.cookie ?? '').split(';').map((part) => part.trim()).filter((part) => part.startsWith(`${name}=`));
  if (values.length !== 1) return '';
  const value = values[0]!.slice(name.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : '';
}

export function createAuthRouter(database: PrismaClient, config: Config, provider: IdentityProvider, knowledge?: KnowledgeDependencies) {
  const router = Router();
  const companies = createCompanyService(database);
  const secure = new URL(config.PUBLIC_ORIGIN).protocol === 'https:';
  const sessionCookie = secure ? '__Host-sg_session' : 'sg_session';
  const loginCookie = secure ? '__Host-sg_login' : 'sg_login';
  const cookieOptions = { httpOnly: true, secure, sameSite: 'lax' as const, path: '/' };
  const setSessionCookie = (res: Response, token: string, expires: Date) => res.cookie(sessionCookie, token, { ...cookieOptions, expires });
  const clearSessionCookie = (res: Response) => res.clearCookie(sessionCookie, cookieOptions);
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  const requireSession: RequestHandler = async (req, res, next) => {
    if (config.AUTH_MODE === 'disabled') return fail(503, 'AUTH_UNAVAILABLE', 'Sign-in is not configured');
    const token = cookie(req, sessionCookie);
    if (!token) return fail(401, 'UNAUTHENTICATED', 'Please sign in');
    const session = await database.authSession.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
    const now = Date.now();
    if (!session || !session.user.active || session.user.issuer !== config.OIDC_ISSUER || session.expiresAt.getTime() <= now || session.lastSeenAt.getTime() <= now - 30 * 60_000) {
      if (session) await database.authSession.deleteMany({ where: { tokenHash: session.tokenHash } });
      clearSessionCookie(res);
      return fail(401, 'UNAUTHENTICATED', 'Your session has expired. Please sign in again');
    }
    const updated = await database.authSession.updateMany({ where: { tokenHash: session.tokenHash, expiresAt: { gt: new Date() } }, data: { lastSeenAt: new Date() } });
    if (!updated.count) return fail(401, 'UNAUTHENTICATED', 'Please sign in');
    res.locals.auth = { session, user: session.user } satisfies Context;
    next();
  };
  const requireCsrf: RequestHandler = (req, res, next) => {
    const supplied = req.get('X-CSRF-Token') ?? '';
    if (req.get('Origin') !== config.PUBLIC_ORIGIN || !equal(supplied, context(res).session.csrfToken)) return fail(403, 'CSRF_REJECTED', 'Refresh the page and try again');
    next();
  };
  const authenticatedLimit = rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false,
    keyGenerator: (_req, res) => context(res).user.id,
    handler: () => fail(429, 'RATE_LIMITED', 'Too many requests. Please wait a moment'),
  });
  const requireTenant: RequestHandler = async (req, res, next) => {
    const organizationId = req.get('X-Organization-Id');
    if (!uuid.safeParse(organizationId).success) return fail(400, 'ORGANIZATION_REQUIRED', 'Select a company');
    const identity = context(res);
    if (identity.session.activeOrganizationId !== organizationId) return fail(404, 'NOT_FOUND', 'Resource not found');
    const membership = await database.membership.findFirst({ where: { organizationId, userId: identity.user.id, active: true, organization: { active: true } } });
    if (!membership) return fail(404, 'NOT_FOUND', 'Resource not found');
    identity.membership = membership;
    next();
  };
  const requireOwner: RequestHandler = (_req, res, next) => {
    if (context(res).membership?.role !== 'OWNER') return fail(403, 'FORBIDDEN', 'Owner access required');
    next();
  };

  router.get('/auth/config', (_req, res) => { res.json({ enabled: config.AUTH_MODE !== 'disabled', mode: config.AUTH_MODE, loginUrl: `${config.PUBLIC_ORIGIN}/api/auth/login` }); });
  router.get('/auth/login', async (_req, res) => {
    if (config.AUTH_MODE === 'disabled') return fail(503, 'AUTH_UNAVAILABLE', 'Sign-in is not configured');
    const state = random(); const verifier = random(); const nonce = random();
    // Expired transactions contain PKCE material and are removed on the next login attempt.
    await database.loginTransaction.deleteMany({ where: { expiresAt: { lte: new Date() } } });
    const url = await provider.authorize(state, verifier, nonce);
    await database.loginTransaction.create({ data: { stateHash: hashToken(state), verifier, nonce, expiresAt: new Date(Date.now() + 600_000) } });
    res.cookie(loginCookie, state, { ...cookieOptions, maxAge: 600_000 });
    res.redirect(url);
  });
  router.get('/auth/callback', async (req, res) => {
    if (config.AUTH_MODE === 'disabled') return fail(503, 'AUTH_UNAVAILABLE', 'Sign-in is not configured');
    res.clearCookie(loginCookie, cookieOptions);
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    if (!state || !equal(state, cookie(req, loginCookie))) return fail(400, 'LOGIN_REJECTED', 'Sign-in could not be verified. Try again');
    const transaction = await database.$transaction(async (tx) => {
      const item = await tx.loginTransaction.findUnique({ where: { stateHash: hashToken(state) } });
      if (!item || item.expiresAt.getTime() <= Date.now()) return null;
      const consumed = await tx.loginTransaction.deleteMany({ where: { stateHash: item.stateHash } });
      return consumed.count === 1 ? item : null;
    });
    if (!transaction) return fail(400, 'LOGIN_REJECTED', 'Sign-in expired or was already used. Try again');
    let identity;
    const callback = new URL('/api/auth/callback', config.PUBLIC_ORIGIN);
    callback.search = new URL(req.originalUrl, config.PUBLIC_ORIGIN).search;
    try { identity = await provider.redeem(callback, state, transaction.verifier, transaction.nonce); }
    catch { return res.redirect(`${config.PUBLIC_ORIGIN}/?authError=signin`); }
    const user = await database.user.upsert({ where: { issuer_subject: { issuer: identity.issuer, subject: identity.subject } },
      create: { issuer: identity.issuer, subject: identity.subject, email: identity.email, name: identity.name }, update: { email: identity.email, name: identity.name } });
    if (!user.active) return fail(403, 'ACCOUNT_DISABLED', 'This account is disabled');
    const previous = cookie(req, sessionCookie);
    if (previous) await database.authSession.deleteMany({ where: { tokenHash: hashToken(previous) } });
    const token = random();
    const expiresAt = new Date(Math.min(identity.expiresAt.getTime(), Date.now() + 8 * 60 * 60_000));
    if (expiresAt.getTime() <= Date.now()) return fail(400, 'LOGIN_REJECTED', 'Sign-in expired. Try again');
    await database.authSession.create({ data: { tokenHash: hashToken(token), userId: user.id, csrfToken: random(), expiresAt } });
    setSessionCookie(res, token, expiresAt);
    res.redirect(config.PUBLIC_ORIGIN);
  });

  router.get('/auth/session', requireSession, authenticatedLimit, async (_req, res) => {
    const { session, user } = context(res);
    const membership = session.activeOrganizationId ? await database.membership.findFirst({ where: { organizationId: session.activeOrganizationId, userId: user.id, active: true, organization: { active: true } }, include: { organization: true } }) : null;
    res.json({ user: { id: user.id, email: user.email, name: user.name }, csrfToken: session.csrfToken, expiresAt: session.expiresAt,
      activeOrganization: membership ? { id: membership.organization.id, name: membership.organization.name, role: membership.role } : null });
  });
  router.post('/auth/logout', requireSession, authenticatedLimit, requireCsrf, async (_req, res) => {
    await database.authSession.deleteMany({ where: { tokenHash: context(res).session.tokenHash } });
    clearSessionCookie(res);
    let logoutUrl = config.PUBLIC_ORIGIN;
    try { logoutUrl = await provider.logoutUrl(); } catch { /* Application session is revoked even if the identity provider is down. */ }
    res.json({ logoutUrl });
  });

  router.use('/v1', requireSession, authenticatedLimit);
  router.get('/v1/me/organizations', async (_req, res) => {
    const memberships = await database.membership.findMany({ where: { userId: context(res).user.id, active: true, organization: { active: true } }, include: { organization: true }, orderBy: { organization: { name: 'asc' } } });
    res.json({ items: memberships.map((item) => ({ id: item.organization.id, name: item.organization.name, timezone: item.organization.timezone, role: item.role })) });
  });
  router.post('/v1/me/organization', requireCsrf, async (req, res) => {
    const parsed = z.object({ organizationId: uuid }).strict().safeParse(req.body);
    if (!parsed.success) return fail(400, 'INVALID_REQUEST', 'Select a valid company');
    const current = context(res);
    const membership = await database.membership.findFirst({ where: { organizationId: parsed.data.organizationId, userId: current.user.id, active: true, organization: { active: true } } });
    if (!membership) return fail(404, 'NOT_FOUND', 'Resource not found');
    const token = random(); const csrfToken = random();
    await database.$transaction(async (tx) => {
      const removed = await tx.authSession.deleteMany({ where: { tokenHash: current.session.tokenHash } });
      if (!removed.count) return fail(401, 'UNAUTHENTICATED', 'Please sign in');
      await tx.authSession.create({ data: { tokenHash: hashToken(token), csrfToken, userId: current.user.id, expiresAt: current.session.expiresAt, activeOrganizationId: membership.organizationId } });
      await tx.auditEvent.create({ data: { organizationId: membership.organizationId, actorMembershipId: membership.id, action: 'ORGANIZATION_SELECTED', targetId: membership.organizationId, details: {} } });
    });
    setSessionCookie(res, token, current.session.expiresAt);
    res.json({ organizationId: membership.organizationId });
  });
  router.post('/v1/invitations/accept', requireCsrf, async (req, res) => {
    const parsed = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict().safeParse(req.body);
    if (!parsed.success) return fail(400, 'INVALID_REQUEST', 'Invalid invitation');
    await companies.acceptInvitation(context(res).user, parsed.data.token);
    res.json({ accepted: true });
  });

  router.use('/v1', requireTenant);
  router.use('/v1', createInventoryRouter(database, requireCsrf));
  router.use('/v1', createKnowledgeRouter(database, requireCsrf, knowledge));
  router.use('/v1', createOnboardingRouter(database, requireCsrf));
  router.use('/v1', createVisitRouter(database, requireCsrf));
  router.use('/v1', createDispatchRouter(database, requireCsrf));
  router.use('/v1', createSchedulingRouter(database, requireCsrf));
  router.use('/v1', createIntakeRouter(database, requireCsrf));
  router.get('/v1/organizations/:organizationId', async (req, res) => {
    const membership = context(res).membership!;
    if (req.params.organizationId !== membership.organizationId) return fail(404, 'NOT_FOUND', 'Resource not found');
    const organization = await database.organization.findUniqueOrThrow({ where: { id: membership.organizationId } });
    res.json({ id: organization.id, name: organization.name, timezone: organization.timezone, role: membership.role });
  });
  router.get('/v1/memberships', requireOwner, async (_req, res) => {
    const rows = await database.membership.findMany({ where: { organizationId: context(res).membership!.organizationId }, include: { user: true }, orderBy: { id: 'asc' } });
    res.json({ items: rows.map((item) => ({ id: item.id, name: item.user.name, email: item.user.email, role: item.role, active: item.active })) });
  });
  router.patch('/v1/memberships/:membershipId', requireCsrf, requireOwner, async (req, res) => {
    const parsed = z.object({ role, active: z.boolean() }).strict().safeParse(req.body);
    if (!parsed.success || !uuid.safeParse(req.params.membershipId).success) return fail(400, 'INVALID_REQUEST', 'Invalid membership update');
    await companies.updateMembership(context(res).membership!, req.params.membershipId as string, parsed.data);
    res.json({ updated: true });
  });
  router.post('/v1/invitations', requireCsrf, requireOwner, async (req, res) => {
    const parsed = z.object({ email: z.email().max(254).transform((value) => value.trim().toLowerCase()), role }).strict().safeParse(req.body);
    if (!parsed.success) return fail(400, 'INVALID_REQUEST', 'Enter a valid email and role');
    const invitation = await companies.invite(context(res).membership!, parsed.data);
    res.status(201).json({ id: invitation.id, expiresAt: invitation.expiresAt, inviteUrl: `${config.PUBLIC_ORIGIN}/#invite=${invitation.token}` });
  });
  router.get('/v1/audit-events', requireOwner, async (_req, res) => {
    const rows = await database.auditEvent.findMany({ where: { organizationId: context(res).membership!.organizationId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100, select: { id: true, action: true, targetId: true, createdAt: true } });
    res.json({ items: rows });
  });
  return router;
}

export function authError(error: unknown) {
  return error instanceof AuthError ? { status: error.status, code: error.code, message: error.message } : undefined;
}
