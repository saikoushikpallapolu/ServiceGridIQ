import request from 'supertest';
import { expect, it } from 'vitest';
import { createApp } from '../app.js';
it('protects bounded aggregate metrics and exposes no URLs, tenant IDs or credentials', async () => {
  const token = 'fictional-metrics-token-32-characters'; const app = createApp({ checkDatabase: async () => { throw new Error('secret'); }, metricsToken: token, logLevel: 'silent' });
  await request(app).get('/internal/metrics').expect(404); await request(app).get('/internal/metrics').set('Authorization', 'Bearer wrong').expect(404);
  await request(app).get('/health/ready?private=hidden').expect(503);
  const response = await request(app).get('/internal/metrics').set('Authorization', `Bearer ${token}`).expect(200);
  expect(response.text).toContain('servicegrid_http_errors_total 1'); expect(response.text).toContain('servicegrid_http_duration_seconds_bucket');
  for (const secret of ['private', 'hidden', 'secret', token]) expect(response.text).not.toContain(secret);
  await request(createApp({ checkDatabase: async () => {}, logLevel: 'silent' })).get('/internal/metrics').expect(404);
});
