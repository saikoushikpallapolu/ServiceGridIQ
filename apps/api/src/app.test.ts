import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { Router } from 'express';

describe('health boundaries', () => {
  it('limits login attempts separately from normal workspace requests', async () => {
    const routes = Router(); routes.get('/auth/login', (_req, res) => { res.sendStatus(204); });
    const app = createApp({ checkDatabase: async () => {}, logLevel: 'silent', authRouter: routes });
    for (let attempt = 0; attempt < 20; attempt++) await request(app).get('/api/auth/login').expect(204);
    await request(app).get('/api/auth/login').expect(429);
    await request(app).get('/health/live').expect(200);
  });
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
  it('does not log cookies, authorization, callback queries or redirect state', async () => {
    let logs = '';
    const routes = Router();
    routes.get('/redirect', (_req, res) => { res.cookie('sg_session', 'outgoing-secret'); res.redirect('http://localhost:8082/auth?state=redirect-secret'); });
    const app = createApp({ checkDatabase: async () => {}, authRouter: routes, logDestination: { write: (line) => { logs += line; } } });
    await request(app).get('/api/redirect?code=callback-secret').set('Cookie', 'sg_session=incoming-secret').set('Authorization', 'Bearer authorization-secret').expect(302);
    expect(logs).toContain('302');
    for (const secret of ['outgoing-secret', 'redirect-secret', 'callback-secret', 'incoming-secret', 'authorization-secret']) expect(logs).not.toContain(secret);
  });
});
