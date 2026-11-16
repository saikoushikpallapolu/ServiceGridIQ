import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import * as c from '../packages/contracts/dist/index.js';
const { z } = createRequire(new URL('../packages/contracts/package.json', import.meta.url))('zod');
const version = z.object({ version: z.number().int().positive() });
const core = c.technicianInputSchema.extend({ id: z.uuid(), version: z.number().int(), active: z.boolean(), safetyRestricted: z.boolean() }).strip();
const schemas = {};
for (const [name, value] of Object.entries({ BranchInput: c.branchInputSchema, SkillInput: c.skillInputSchema, TechnicianInput: c.technicianInputSchema, TechnicianUpdate: c.technicianUpdateSchema, VerifiedSkillInput: c.verifiedSkillInputSchema, AvailabilityInput: c.availabilityInputSchema, SchedulingInput: c.schedulingInputSchema, EligibilityInput: c.eligibilityInputSchema, RemoveAvailabilityInput: version.strict(), Branch: c.branchSchema, Skill: c.skillSchema, Technician: c.technicianSchema, TechnicianCore: core, Availability: c.availabilitySchema, PolicyResponse: z.object({ policy: c.schedulingSchema.nullable(), jobVersion: z.number().int() }), Eligibility: c.eligibilitySchema, Version: version, JobVersion: z.object({ jobVersion: z.number().int() }), Removed: z.object({ removed: z.literal(true) }), TechnicianMember: z.object({ id: z.uuid(), name: z.string(), email: z.email() }), Error: c.errorSchema })) {
  const schema = z.toJSONSchema(value, { target: 'draft-2020-12' }); delete schema.$schema;
  if (!name.endsWith('Input') && !name.endsWith('Update')) { const relax = (node) => { if (!node || typeof node !== 'object') return; if (node.type === 'object') node.additionalProperties = true; Object.values(node).forEach(relax); }; relax(schema); }
  schemas[name] = schema;
}
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const response = (schema, description = 'Successful response') => ({ description, content: { 'application/json': { schema } } });
const list = (name) => ({ type: 'object', required: ['items', 'total', 'page', 'limit'], properties: { items: { type: 'array', items: ref(name) }, total: { type: 'integer' }, page: { type: 'integer' }, limit: { type: 'integer' } } });
const paths = {};
function add(path, method, operationId, output, input, owner = false, paginated = false, created = false) {
  const mutation = method !== 'get'; paths[`/api/v1${path}`] ??= {};
  paths[`/api/v1${path}`][method] = { operationId, description: `${owner ? 'Owner only.' : 'Owner or dispatcher.'} Company-scoped. ${path.includes('eligibility') ? 'Read-only snapshot, no reservation or assignment is committed.' : ''}`, security: [{ Session: [] }], parameters: [
    { name: 'X-Organization-Id', in: 'header', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Must match active server session and current membership.' },
    ...(mutation ? [{ name: 'X-CSRF-Token', in: 'header', required: true, schema: { type: 'string' } }, { name: 'Origin', in: 'header', required: true, schema: { type: 'string' }, description: 'Exact configured public application origin.' }] : []),
    ...[...path.matchAll(/\{([^}]+)\}/g)].map((match) => ({ name: match[1], in: 'path', required: true, schema: { type: 'string', format: 'uuid' } })),
    ...(paginated ? [{ name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 10000, default: 1 } }, { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 25 } }] : [])],
    ...(input ? { requestBody: { required: true, content: { 'application/json': { schema: ref(input) } } } } : {}), responses: { [created ? '201' : '200']: response(output), ...Object.fromEntries([400, 401, 403, 404, 409, 429, 500].map((status) => [status, response(ref('Error'), status === 409 ? 'Stale version, overlapping interval, missing intake/policy, or active reservation prevents mutation.' : 'Safe request error with trace ID.')])) } };
}
for (const [resource, model] of [['branches', 'Branch'], ['skills', 'Skill']]) { add(`/${resource}`, 'get', `list${model}Records`, list(model), null, false, true); add(`/${resource}`, 'post', `create${model}`, ref(model), `${model}Input`, true, false, true); }
add('/technician-memberships', 'get', 'listUnprofiledTechnicianMemberships', list('TechnicianMember'), null, true, true);
add('/technicians', 'get', 'listTechnicianProfiles', list('Technician'), null, false, true);
add('/technicians', 'post', 'createTechnicianProfile', ref('TechnicianCore'), 'TechnicianInput', true, false, true);
add('/technicians/{id}', 'patch', 'updateTechnicianProfile', ref('TechnicianCore'), 'TechnicianUpdate', true);
add('/technicians/{id}/skills/{skillId}', 'put', 'verifyTechnicianSkill', ref('Version'), 'VerifiedSkillInput', true);
add('/technicians/{id}/availability', 'post', 'createAvailabilityInterval', ref('Availability'), 'AvailabilityInput', false, false, true);
add('/technicians/{id}/availability/{blockId}', 'delete', 'removeAvailabilityInterval', ref('Removed'), 'RemoveAvailabilityInput');
add('/job-scheduling/{jobId}', 'get', 'getSchedulingPolicy', ref('PolicyResponse'));
add('/job-scheduling/{jobId}', 'put', 'updateSchedulingPolicy', ref('JobVersion'), 'SchedulingInput');
add('/job-scheduling/{jobId}/eligibility', 'post', 'previewAppointmentEligibility', ref('Eligibility'), 'EligibilityInput');
writeFileSync(new URL('../docs/api/phase-4-openapi.json', import.meta.url), JSON.stringify({ openapi: '3.1.0', info: { title: 'ServiceGrid IQ implemented Phase 4 scheduling foundation', version: '0.4.0', description: 'Local-only technician, branch, owner-verified qualification and interval availability management. Job and technician mutations require current versions. Appointment start must be inside the arrival window. One shift covers travel plus work; all intervals are half-open. Eligibility is a snapshot, with no ranking, parts readiness or public booking endpoint. AWS and production deployment remain deferred.' }, paths, components: { schemas, securitySchemes: { Session: { type: 'apiKey', in: 'cookie', name: 'sg_session', description: 'Opaque local HttpOnly session. HTTPS configuration uses __Host-sg_session. See Phase 2 OIDC endpoints.' } } } }, null, 2) + '\n');
console.log('Generated Phase 4 API contract from shared schemas.');
