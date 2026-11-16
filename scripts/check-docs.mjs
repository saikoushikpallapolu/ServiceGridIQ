import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'README.md',
  'CONTRIBUTING.md',
  'docs/README.md',
  'docs/architecture/ServiceGrid_IQ_Build_Blueprint_v2.md',
  'docs/architecture/ServiceGrid_IQ_Build_Blueprint_v2.pdf',
  'docs/plans/ServiceGrid_IQ_Phase_Wise_Build_Plan.md',
  'docs/plans/ServiceGrid_IQ_Phase_Wise_Build_Plan.pdf',
  'docs/plans/phase-1-checklist.md',
  'docs/archive/ServiceGrid_IQ_Product_and_Engineering_Blueprint.pdf',
  'docs/api/ServiceGrid_IQ_Pilot_OpenAPI_v2.json',
];

for (const name of required) {
  const target = resolve(root, name);
  assert(existsSync(target) && statSync(target).size > 0, `Missing or empty: ${name}`);
  if (name.endsWith('.pdf')) {
    assert.equal(readFileSync(target).subarray(0, 5).toString(), '%PDF-', `Invalid PDF header: ${name}`);
  }
}

function markdownFiles(folder) {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const target = resolve(folder, entry.name);
    if (entry.isDirectory()) return markdownFiles(target);
    return entry.name.endsWith('.md') ? [target] : [];
  });
}

const documents = [resolve(root, 'README.md'), resolve(root, 'CONTRIBUTING.md'), ...markdownFiles(resolve(root, 'docs'))];
for (const document of documents) {
  const text = readFileSync(document, 'utf8');
  for (const match of text.matchAll(/\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const href = match[1];
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#')) continue;
    const local = decodeURIComponent(href.split('#')[0]);
    const target = resolve(dirname(document), local);
    const inside = relative(root, target);
    assert(inside !== '..' && !inside.startsWith(`..${sep}`), `Link leaves repository: ${href}`);
    assert(existsSync(target), `Broken link in ${relative(root, document)}: ${href}`);
  }
}

const spec = JSON.parse(readFileSync(resolve(root, 'docs/api/ServiceGrid_IQ_Pilot_OpenAPI_v2.json'), 'utf8'));
assert.equal(spec.openapi, '3.1.0');
const operations = new Set();
const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']);
for (const [path, item] of Object.entries(spec.paths)) {
  for (const [method, operation] of Object.entries(item)) {
    if (!methods.has(method)) continue;
    assert(operation.operationId && !operations.has(operation.operationId), `Missing or duplicate operation ID: ${path}`);
    operations.add(operation.operationId);
    assert(operation.responses && Object.keys(operation.responses).length, `Missing responses: ${path}`);
  }
}
assert(operations.size > 0, 'No API operations defined');

function checkReferences(value) {
  if (Array.isArray(value)) return value.forEach(checkReferences);
  if (!value || typeof value !== 'object') return;
  if (value.$ref) {
    assert(value.$ref.startsWith('#/'), `External reference requires explicit validation: ${value.$ref}`);
    let current = spec;
    for (const token of value.$ref.slice(2).split('/')) {
      const key = token.replaceAll('~1', '/').replaceAll('~0', '~');
      assert(current && Object.hasOwn(current, key), `Unresolved reference: ${value.$ref}`);
      current = current[key];
    }
  }
  Object.values(value).forEach(checkReferences);
}
checkReferences(spec);
console.log(`Documentation checks passed: ${documents.length} Markdown files, ${operations.size} API operations, required files and local references verified.`);
console.log('This is an artifact check, not full OpenAPI validation or application testing.');
