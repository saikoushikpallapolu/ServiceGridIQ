import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import * as contracts from '../packages/contracts/dist/index.js';
const require = createRequire(new URL('../packages/contracts/package.json', import.meta.url));
const { z } = require('zod');
const schemas = {};
for (const [name, value] of Object.entries({ CustomerInput: contracts.customerInputSchema, SiteInput: contracts.siteInputSchema, EquipmentInput: contracts.equipmentInputSchema, JobInput: contracts.jobInputSchema, JobUpdate: contracts.jobUpdateSchema, JobTransition: contracts.jobTransitionSchema,
  CustomerUpdate: contracts.customerInputSchema.extend({ version: z.number().int().positive() }), SiteUpdate: contracts.siteInputSchema.omit({ customerId: true }).extend({ version: z.number().int().positive() }), EquipmentUpdate: contracts.equipmentInputSchema.omit({ siteId: true }).extend({ version: z.number().int().positive() }),
  Customer: contracts.customerSchema, Site: contracts.siteSchema, Equipment: contracts.equipmentSchema, Job: contracts.jobSchema, JobSummary: contracts.jobSummarySchema, JobDetail: contracts.jobDetailSchema, Error: contracts.errorSchema })) {
  const schema = z.toJSONSchema(value, { target: 'draft-2020-12' }); delete schema.$schema;
  // Responses include tenant metadata and may be extended; request bodies remain strict.
  if (!name.endsWith('Input') && !name.endsWith('Update') && name !== 'JobTransition') {
    const relax = (node) => { if (!node || typeof node !== 'object') return; if (node.type === 'object') node.additionalProperties = true; Object.values(node).forEach(relax); };
    relax(schema);
  }
  schemas[name] = schema;
}
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const response = (schema) => ({ description: 'Successful response', content: { 'application/json': { schema } } });
const pagination = (name) => ({ type: 'object', required: ['items', 'total', 'page', 'limit'], properties: { items: { type: 'array', items: ref(name) }, total: { type: 'integer' }, page: { type: 'integer' }, limit: { type: 'integer' } } });
const query = (name, schema, description) => ({ name, in: 'query', required: false, schema, description });
const baseQueries = [query('page', { type: 'integer', minimum: 1, maximum: 10000, default: 1 }, 'Offset page, stable ordering within unchanged data.'), query('limit', { type: 'integer', minimum: 1, maximum: 100, default: 25 }, 'Rows per page.')];
const paths = {};
function add(path, method, id, result, input, parameters = []) {
  const mutations = method !== 'get';
  paths[`/api/v1${path}`] ??= {};
  paths[`/api/v1${path}`][method] = { operationId: id, summary: id.replaceAll(/([A-Z])/g, ' $1'), security: [{ Session: [] }], parameters: [
    { name: 'X-Organization-Id', in: 'header', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Must match the active server session and an active owner/dispatcher membership.' },
    ...(mutations ? [{ name: 'X-CSRF-Token', in: 'header', required: true, schema: { type: 'string' } }, { name: 'Origin', in: 'header', required: true, schema: { type: 'string' }, description: 'Exact configured application origin.' }] : []),
    ...(path.includes('{id}') ? [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }] : []), ...parameters],
    ...(input ? { requestBody: { required: true, content: { 'application/json': { schema: ref(input) } } } } : {}),
    responses: { [method === 'post' && !path.includes('transitions') ? '201' : '200']: response(result), ...Object.fromEntries([400, 401, 403, 404, 409, 429, 500].map((status) => [status, { ...response(ref('Error')), description: status === 409 ? 'Stale version or disallowed state transition; reload and compare.' : 'Request rejected; safe error and trace ID.' }])) } };
}
for (const [path, model] of [['customers', 'Customer'], ['sites', 'Site'], ['equipment', 'Equipment']]) {
  add(`/${path}`, 'get', `list${model}Records`, pagination(model), null, [...baseQueries, ...(path === 'customers' ? [query('q', { type: 'string', maxLength: 160 }, 'Case-insensitive customer-name search.')] : [query(path === 'sites' ? 'customerId' : 'siteId', { type: 'string', format: 'uuid' }, 'Filter by parent record.')])]);
  add(`/${path}`, 'post', `create${model}`, ref(model), `${model}Input`);
  add(`/${path}/{id}`, 'patch', `update${model}`, ref(model), `${model}Update`);
}
add('/jobs', 'get', 'listJobs', pagination('JobSummary'), null, [...baseQueries, query('q', { type: 'string', maxLength: 160 }, 'Complaint, customer name or equipment serial substring.'), query('status', { type: 'string', enum: ['DRAFT', 'TRIAGED'] }, 'Exact state.'), query('priority', { type: 'string', enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'] }, 'Exact priority.'), query('customerId', { type: 'string', format: 'uuid' }, 'Customer filter.')]);
add('/jobs', 'post', 'createDraftJob', ref('Job'), 'JobInput');
add('/jobs/{id}', 'get', 'getJobDetail', ref('JobDetail'));
add('/jobs/{id}', 'patch', 'updateDraftJob', ref('Job'), 'JobUpdate');
add('/jobs/{id}/transitions', 'post', 'transitionJob', ref('Job'), 'JobTransition');
writeFileSync(new URL('../docs/api/phase-3-openapi.json', import.meta.url), JSON.stringify({ openapi: '3.1.0', info: { title: 'ServiceGrid IQ implemented Phase 3 intake API', version: '0.3.0', description: 'Local implementation contract. Owner/dispatcher only. Arrival instants require an offset, end after start and at most seven days later. Duration and travel are estimates, not appointments. Draft edits and transitions require the latest version. TRIAGED must return to DRAFT with a reason before editing. History contains the newest 20 other equipment requests; timeline contains the newest 100 events. No deletion, equipment relocation, technician queue access or scheduling is implemented.' }, paths, components: { securitySchemes: { Session: { type: 'apiKey', in: 'cookie', name: 'sg_session', description: 'Opaque HttpOnly local cookie; HTTPS uses __Host-sg_session. Sign in through the Phase 2 OIDC endpoints.' } }, schemas } }, null, 2) + '\n');
console.log('Generated the implemented Phase 3 contract from shared Zod schemas.');
