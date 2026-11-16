import { z } from 'zod';

export const healthSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  service: z.literal('servicegrid-api'),
  version: z.string(),
  timestamp: z.iso.datetime(),
  checks: z.object({ database: z.enum(['up', 'down', 'not_checked']) }),
});
export type Health = z.infer<typeof healthSchema>;

export const errorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), traceId: z.string() }),
});
