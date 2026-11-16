import assert from 'node:assert/strict';

const base = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:8080';
for (const path of ['/', '/health/live', '/health/ready']) {
  const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(10_000) });
  assert.equal(response.status, 200, `${path} should return 200`);
  if (path === '/') assert((await response.text()).includes('ServiceGrid IQ'));
  else {
    const data = await response.json();
    assert.equal(data.service, 'servicegrid-api');
    assert.equal(data.status, 'ok');
    if (path.endsWith('ready')) assert.equal(data.checks.database, 'up');
  }
}
console.log(`Smoke checks passed for ${base}: frontend, liveness, readiness and PostgreSQL.`);
