import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.url().refine((value) => /^postgres(ql)?:/.test(value), 'PostgreSQL URL required'),
  LOG_LEVEL: z.enum(['silent', 'fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export function parseConfig(input: NodeJS.ProcessEnv) {
  const result = schema.safeParse(input);
  if (!result.success) {
    // Report field names only; never print connection strings or secrets.
    throw new Error(`Invalid environment fields: ${[...new Set(result.error.issues.map((issue) => issue.path.join('.')))].join(', ')}`);
  }
  return result.data;
}
