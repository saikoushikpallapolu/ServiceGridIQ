import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';

describe('health boundaries', () => {
  it('remains live when the database is down and hides dependency errors', async () => {
    const app = createApp({ checkDatabase: async () => { throw new Error('secret-password'); }, logLevel: 'silent' });
    const live = await request(app).get('/health/live').expect(200);
    expect(live.body.checks.database).toBe('not_checked');
    const ready = await request(app).get('/health/ready').expect(503);
    expect(ready.body.checks.database).toBe('down');
    expect(ready.text).not.toContain('secret-password');
    expect(ready.headers['cache-control']).toBe('no-store');
  });
  it('reports database success and assigns its own correlation ID', async () => {
    const app = createApp({ checkDatabase: async () => {}, logLevel: 'silent' });
    const response = await request(app).get('/health/ready').set('X-Request-Id', 'untrusted').expect(200);
    expect(response.body.checks.database).toBe('up');
    expect(response.headers['x-request-id']).not.toBe('untrusted');
  });
  it('returns a bounded failure when a dependency never responds', async () => {
    const app = createApp({ checkDatabase: () => new Promise(() => {}), logLevel: 'silent' });
    await request(app).get('/health/ready').expect(503);
  });
  it('returns safe errors for malformed JSON and unknown routes', async () => {
    const app = createApp({ checkDatabase: async () => {}, logLevel: 'silent' });
    const invalid = await request(app).post('/api/example').set('Content-Type', 'application/json').send('{secret').expect(400);
    expect(invalid.text).not.toContain('{secret');
    const missing = await request(app).get('/api/v1/jobs').expect(404);
    expect(missing.body.error.traceId).toBeTruthy();
  });
});
