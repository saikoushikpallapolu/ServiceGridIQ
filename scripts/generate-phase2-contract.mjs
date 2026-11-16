import { writeFileSync } from 'node:fs';

const string = { type: 'string' };
const uuid = { type: 'string', format: 'uuid' };
const role = { type: 'string', enum: ['OWNER', 'DISPATCHER', 'TECHNICIAN'] };
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });
const array = (items) => ({ type: 'array', items });
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const schemas = {
  Error: object({ error: object({ code: string, message: string, traceId: string }) }),
  Organization: object({ id: uuid, name: string, role }),
  Membership: object({ id: uuid, name: string, email: { type: 'string', format: 'email' }, role, active: { type: 'boolean' } }),
  Session: object({ user: object({ id: uuid, email: { type: 'string', format: 'email' }, name: string }), csrfToken: string, expiresAt: { type: 'string', format: 'date-time' }, activeOrganization: { anyOf: [ref('Organization'), { type: 'null' }] } }),
};
const paths = {};
function operation(path, method, id, description, response, { request, authenticated = true, tenant = false, mutation = false, status = '200' } = {}) {
  const parameters = [...path.matchAll(/\{(\w+)\}/g)].map((match) => ({ name: match[1], in: 'path', required: true, schema: uuid }));
  if (tenant) parameters.push({ name: 'X-Organization-Id', in: 'header', required: true, schema: uuid });
  if (mutation) parameters.push({ name: 'Origin', in: 'header', required: true, schema: { type: 'string', format: 'uri' } }, { name: 'X-CSRF-Token', in: 'header', required: true, schema: string });
  const responses = { [status]: { description: 'Success', ...(response ? { content: { 'application/json': { schema: response } } } : {}) } };
  for (const code of ['400', '401', '403', '404', '409', '429', '503']) responses[code] = { description: 'Validation, identity, permission, state, rate or provider failure; see error.code.', content: { 'application/json': { schema: ref('Error') } } };
  const value = { operationId: id, description, parameters, security: authenticated ? [{ SecureSession: [] }, { LocalSession: [] }] : [], responses };
  if (request) value.requestBody = { required: true, content: { 'application/json': { schema: request } } };
  paths[path] ??= {}; paths[path][method] = value;
}
operation('/auth/config', 'get', 'getAuthConfiguration', 'Public sign-in availability and canonical login URL.', object({ enabled: { type: 'boolean' }, mode: { type: 'string', enum: ['disabled', 'local', 'oidc'] }, loginUrl: { type: 'string', format: 'uri' } }), { authenticated: false });
operation('/auth/login', 'get', 'beginLogin', 'Creates a cookie-bound OIDC state/nonce/PKCE transaction and redirects to the configured provider.', undefined, { authenticated: false, status: '302' });
operation('/auth/callback', 'get', 'completeLogin', 'Consumes state once, verifies provider identity and issues an HttpOnly application-session cookie. Provider supplies code/state query parameters.', undefined, { authenticated: false, status: '302' });
paths['/auth/callback'].get.parameters.push({ name: 'state', in: 'query', required: true, schema: string }, { name: 'code', in: 'query', schema: string });
operation('/auth/session', 'get', 'getSession', 'Reads the session and current active-company permissions. Tokens are never returned to JavaScript.', ref('Session'));
operation('/auth/logout', 'post', 'endSession', 'Revokes the application session and returns the configured provider logout URL.', object({ logoutUrl: { type: 'string', format: 'uri' } }), { mutation: true });
operation('/v1/me/organizations', 'get', 'getMyOrganizations', 'Lists active memberships of the current user only.', object({ items: array(object({ id: uuid, name: string, timezone: string, role })) }));
operation('/v1/me/organization', 'post', 'selectOrganization', 'Verifies membership, selects the company and rotates session and CSRF values.', object({ organizationId: uuid }), { mutation: true, request: object({ organizationId: uuid }) });
operation('/v1/organizations/{organizationId}', 'get', 'readAuthorizedOrganization', 'Reads only the active authorized company. Altered company IDs return 404.', ref('Organization'), { tenant: true });
paths['/v1/organizations/{organizationId}'].get.responses['200'].content['application/json'].schema = object({ id: uuid, name: string, timezone: string, role });
operation('/v1/memberships', 'get', 'readCompanyMemberships', 'OWNER only. Lists members of the active company.', object({ items: array(ref('Membership')) }), { tenant: true });
operation('/v1/memberships/{membershipId}', 'patch', 'updateCompanyMembership', 'OWNER only. Tenant-qualified target, serialized owner recheck and last-owner protection; audit is written in the same transaction.', object({ updated: { type: 'boolean' } }), { tenant: true, mutation: true, request: object({ role, active: { type: 'boolean' } }) });
operation('/v1/invitations', 'post', 'createCompanyInvitation', 'OWNER only. Returns a link without sending email; hashes the token, expires it after 72 hours, replaces pending invitations to the same email.', object({ id: uuid, expiresAt: { type: 'string', format: 'date-time' }, inviteUrl: { type: 'string', format: 'uri' } }), { tenant: true, mutation: true, status: '201', request: object({ email: { type: 'string', format: 'email' }, role }) });
operation('/v1/invitations/accept', 'post', 'acceptCompanyInvitation', 'Accepts once using the matching authenticated verified email; company need not already be selected.', object({ accepted: { type: 'boolean' } }), { mutation: true, request: object({ token: { type: 'string', pattern: '^[A-Za-z0-9_-]{43}$' } }) });
operation('/v1/audit-events', 'get', 'readCompanyAccessAudit', 'OWNER only. Returns the newest 100 authorized company events; no token hashes or sensitive details are returned.', object({ items: array(object({ id: uuid, action: string, targetId: string, createdAt: { type: 'string', format: 'date-time' } })) }), { tenant: true });
const document = {
  openapi: '3.1.0', info: { title: 'ServiceGrid IQ Phase 2 Authentication API', version: '0.2.0', description: 'Implemented local authentication subset. SecureSession is used with HTTPS; LocalSession is accepted only in loopback local configuration. Mutations require exact configured Origin and session CSRF token. No bearer-token login or password API. AWS and managed identity deployment remain deferred.' },
  servers: [{ url: 'http://localhost:8080/api' }], paths,
  components: { schemas, securitySchemes: { SecureSession: { type: 'apiKey', in: 'cookie', name: '__Host-sg_session' }, LocalSession: { type: 'apiKey', in: 'cookie', name: 'sg_session' } } },
};
writeFileSync('docs/api/phase-2-openapi.json', JSON.stringify(document, null, 2) + '\n');
console.log(`Phase 2 contract generated: ${Object.values(paths).reduce((count, item) => count + Object.keys(item).length, 0)} operations.`);
