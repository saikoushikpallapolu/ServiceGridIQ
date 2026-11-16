import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import * as c from '../packages/contracts/dist/index.js';
const { z } = createRequire(new URL('../packages/contracts/package.json', import.meta.url))('zod');
const schemas = {};
const version = z.object({ version: z.number().int().positive() }).strict();
for (const [name, value] of Object.entries({ PartInput: c.partInputSchema, LocationInput: c.stockLocationInputSchema, PreparationInput: c.preparationInputSchema, JobPartInput: c.jobPartInputSchema, ConfirmationInput: c.partConfirmationInputSchema, PrerequisiteInput: c.prerequisiteInputSchema, PrerequisiteEvidenceInput: c.prerequisiteEvidenceInputSchema, WarningInput: c.warningInputSchema, AssignmentInput: c.assignmentInputSchema, FreshnessInput: c.freshnessInputSchema, VersionInput: version, Part: c.partSchema, Location: c.stockLocationSchema, Preparation: c.preparationSchema, Readiness: c.readinessSchema, Ranking: c.rankingSchema, AssignmentResult: c.assignmentResultSchema, AssignmentResponse: z.object({ assignment: c.assignmentSchema.nullable() }), Policy: z.object({ hours: z.number().int(), policyVersion: z.number().int() }), Change: z.object({ jobVersion: z.number().int().positive(), id: z.uuid().optional(), evidenceId: z.uuid().optional() }), Error: c.errorSchema })) {
  const schema = z.toJSONSchema(value, { target: 'draft-2020-12' }); delete schema.$schema;
  if (!name.endsWith('Input')) { const relax = (node) => { if (!node || typeof node !== 'object') return; if (node.type === 'object') node.additionalProperties = true; Object.values(node).forEach(relax); }; relax(schema); } schemas[name] = schema;
}
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const response = (schema, description = 'Successful response') => ({ description, content: { 'application/json': { schema } } });
const list = (name) => ({ type: 'object', required: ['items', 'total', 'page', 'limit'], properties: { items: { type: 'array', items: ref(name) }, total: { type: 'integer' }, page: { type: 'integer' }, limit: { type: 'integer' } } });
const paths = {};
function add(path, method, operationId, output, input, created = false, paginated = false) {
  const mutate = method !== 'get'; paths[`/api/v1${path}`] ??= {};
  paths[`/api/v1${path}`][method] = { operationId, description: path === '/dispatch-policy' && mutate ? 'Owner only; policy version is rechecked inside the company transaction.' : 'Current owner or dispatcher membership in the active company required.', security: [{ Session: [] }], parameters: [
    { name: 'X-Organization-Id', in: 'header', required: true, schema: { type: 'string', format: 'uuid' } },
    ...(mutate ? [{ name: 'X-CSRF-Token', in: 'header', required: true, schema: { type: 'string' } }, { name: 'Origin', in: 'header', required: true, schema: { type: 'string' }, description: 'Exact application origin.' }] : []),
    ...(path.endsWith('/assignments') ? [{ name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', pattern: '^[A-Za-z0-9_-]{16,100}$' }, description: 'Reuse the same key and payload for retries. Scoped to company and verified approving membership. Successful responses persist; a changed payload or actor returns 409.' }] : []),
    ...[...path.matchAll(/\{([^}]+)\}/g)].map((match) => ({ name: match[1], in: 'path', required: true, schema: { type: 'string', format: 'uuid' } })),
    ...(paginated ? [{ name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 10000, default: 1 } }, { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 25 } }] : [])],
    ...(input ? { requestBody: { required: true, content: { 'application/json': { schema: ref(input) } } } } : {}), responses: { [created ? '201' : '200']: response(output), ...Object.fromEntries([400, 401, 403, 404, 409, 422, 429, 500].map((status) => [status, response(ref('Error'), status === 422 ? 'Current preparation blocks readiness or assignment; blockers cannot be overridden.' : status === 409 ? 'Version/state conflict, duplicate record, stale policy, ineligible technician or changed idempotency request.' : 'Safe request error with trace ID.')])) } };
}
for (const [path, name] of [['parts', 'Part'], ['stock-locations', 'Location']]) { add(`/${path}`, 'get', `dispatchList${name}Records`, list(name), null, false, true); add(`/${path}`, 'post', `dispatchCreate${name}`, ref(name), `${name}Input`, true); }
add('/dispatch-policy', 'get', 'getDispatchFreshnessPolicy', ref('Policy'));
add('/dispatch-policy', 'put', 'updateDispatchFreshnessPolicy', ref('Policy'), 'FreshnessInput');
add('/preparation/{jobId}', 'get', 'getJobPreparation', ref('Preparation'));
add('/preparation/{jobId}', 'put', 'updateJobPreparationPlan', ref('Change'), 'PreparationInput');
add('/preparation/{jobId}/parts', 'post', 'addJobPartRequirement', ref('Change'), 'JobPartInput', true);
add('/preparation/{jobId}/parts/{partId}', 'put', 'updateJobPartRequirement', ref('Change'), 'JobPartInput');
add('/preparation/{jobId}/parts/{partId}/confirmations', 'post', 'appendPartConfirmation', ref('Change'), 'ConfirmationInput', true);
add('/preparation/{jobId}/prerequisites', 'post', 'addMandatoryPrerequisite', ref('Change'), 'PrerequisiteInput', true);
add('/preparation/{jobId}/prerequisites/{prerequisiteId}/evidence', 'post', 'appendPrerequisiteEvidence', ref('Change'), 'PrerequisiteEvidenceInput', true);
add('/preparation/{jobId}/readiness', 'get', 'evaluateJobReadiness', ref('Readiness'));
add('/preparation/{jobId}/warnings', 'post', 'acknowledgeReadinessWarning', ref('Change'), 'WarningInput');
add('/preparation/{jobId}/ready', 'post', 'approveJobReadiness', ref('Change'), 'VersionInput');
add('/preparation/{jobId}/ranking', 'post', 'rankEligibleTechnicians', ref('Ranking'), 'VersionInput');
add('/preparation/{jobId}/assignments', 'post', 'approveIdempotentAssignment', ref('AssignmentResult'), 'AssignmentInput', true);
add('/preparation/{jobId}/assignment', 'get', 'getCurrentApprovedAssignment', ref('AssignmentResponse'));
writeFileSync(new URL('../docs/api/phase-5-openapi.json', import.meta.url), JSON.stringify({ openapi: '3.1.0', info: { title: 'ServiceGrid IQ implemented Phase 5 readiness and approval API', version: '0.5.0', description: 'Local readiness, visit-bound manual evidence, deterministic dispatch-v2 ranking and atomic idempotent approval. Quantities are positive decimal strings with at most three decimal places. Part confirmation freshness is evaluated against server time (default 24 hours, owner range 1–168). Any material edit invalidates READY and warning acknowledgments; visit or requirement revisions invalidate corresponding evidence. Mandatory checks have no deletion/disable endpoint. Parts are not reserved, stock accounting is absent, and the transactional outbox is recorded but not delivered. See the Phase 5 design for limits and the Phase 3 intake contract for extended READY/ASSIGNED statuses.' }, paths, components: { schemas, securitySchemes: { Session: { type: 'apiKey', in: 'cookie', name: 'sg_session', description: 'Opaque local HttpOnly session; HTTPS uses __Host-sg_session. Sign in through Phase 2 OIDC endpoints.' } } } }, null, 2) + '\n');
console.log('Generated Phase 5 API contract from shared schemas.');
