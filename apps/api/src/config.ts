import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.url().refine((value) => /^postgres(ql)?:/.test(value), 'PostgreSQL URL required'),
  LOG_LEVEL: z.enum(['silent', 'fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  AUTH_MODE: z.enum(['disabled', 'local', 'oidc']).default('disabled'),
  PUBLIC_ORIGIN: z.url().default('http://localhost:8080'),
  OIDC_ISSUER: z.url().optional(),
  OIDC_CLIENT_ID: z.string().min(1).optional(),
  OIDC_CLIENT_SECRET: z.string().min(1).optional(),
  OIDC_INTERNAL_ORIGIN: z.url().optional(),
});

export function parseConfig(input: NodeJS.ProcessEnv) {
  const result = schema.safeParse(input);
  if (!result.success) {
    // Report field names only; never print connection strings or secrets.
    throw new Error(`Invalid environment fields: ${[...new Set(result.error.issues.map((issue) => issue.path.join('.')))].join(', ')}`);
  }
  const config = result.data;
  const origin = new URL(config.PUBLIC_ORIGIN);
  if (origin.origin !== config.PUBLIC_ORIGIN || origin.username || origin.password) throw new Error('PUBLIC_ORIGIN must be an origin without a path or credentials');
  if (config.AUTH_MODE !== 'disabled') {
    if (!config.OIDC_ISSUER || !config.OIDC_CLIENT_ID) throw new Error('OIDC_ISSUER and OIDC_CLIENT_ID are required');
    const issuer = new URL(config.OIDC_ISSUER);
    if (config.AUTH_MODE === 'local') {
      if (![origin, issuer].every((url) => ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('Local authentication requires loopback origins');
    } else if (origin.protocol !== 'https:' || issuer.protocol !== 'https:' || config.OIDC_INTERNAL_ORIGIN) {
      throw new Error('Managed OIDC requires HTTPS and does not allow internal-origin overrides');
    }
  }
  return result.data;
}

export type Config = ReturnType<typeof parseConfig>;
