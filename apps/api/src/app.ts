import { randomUUID } from 'node:crypto';
import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import pino, { type DestinationStream } from 'pino';
import { pinoHttp } from 'pino-http';
import { healthSchema } from '@servicegrid/contracts';
import type { Router } from 'express';
import { authError } from './auth/router.js';

export function createApp(options: { checkDatabase: () => Promise<void>; logLevel?: string; authRouter?: Router; logDestination?: DestinationStream }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(pinoHttp({
    logger: pino({ level: options.logLevel ?? 'info', redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]', 'res.headers.location'] }, options.logDestination),
    genReqId: (_req, res) => {
      const id = randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },
    // Log no query strings, request bodies, or raw error objects.
    serializers: { req: (req) => ({ id: req.id, method: req.method, url: String(req.url).split('?')[0] }), res: (res) => ({ statusCode: res.statusCode }), err: () => ({ message: 'Request failed' }) },
  }));
  app.use(express.json({ limit: '32kb' }));
  const tooMany: express.RequestHandler = (req, res) => { res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests', traceId: String(req.id) } }); };
  app.use('/api/auth/login', rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, handler: tooMany }));
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false,
    handler: tooMany,
  }));

  const health = (database: 'up' | 'down' | 'not_checked') => healthSchema.parse({
    status: database === 'down' ? 'degraded' : 'ok', service: 'servicegrid-api', version: '0.1.0',
    timestamp: new Date().toISOString(), checks: { database },
  });
  app.get('/health/live', (_req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json(health('not_checked')); });
  app.get('/health/ready', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([options.checkDatabase(), new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Readiness timeout')), 2500); })]);
      res.json(health('up'));
    } catch {
      res.status(503).json(health('down'));
    } finally { clearTimeout(timer); }
  });
  if (options.authRouter) app.use('/api', options.authRouter);
  app.use((req, res) => { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found', traceId: String(req.id) } }); });
  const errorHandler: ErrorRequestHandler = (error: unknown, req, res, _next) => {
    void _next; // Express identifies error middleware by its four-argument signature.
    const known = authError(error);
    if (known) { res.status(known.status).json({ error: { code: known.code, message: known.message, traceId: String(req.id) } }); return; }
    const status = typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number' ? error.status : 500;
    const safeStatus = status >= 400 && status < 500 ? status : 500;
    res.status(safeStatus).json({ error: { code: safeStatus === 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST', message: safeStatus === 500 ? 'An unexpected error occurred' : 'Invalid request', traceId: String(req.id) } });
  };
  app.use(errorHandler);
  return app;
}
