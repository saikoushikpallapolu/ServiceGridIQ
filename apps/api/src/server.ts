import { createApp } from './app.js';
import { parseConfig } from './config.js';
import { createDatabase } from './database.js';
import { createAuthRouter } from './auth/router.js';
import { createIdentityProvider } from './auth/oidc.js';

const config = parseConfig(process.env);
const database = createDatabase(config.DATABASE_URL);
const app = createApp({ checkDatabase: async () => { await database.$queryRaw`SELECT 1`; }, logLevel: config.LOG_LEVEL,
  authRouter: createAuthRouter(database, config, createIdentityProvider(config)) });
const server = app.listen(config.PORT, config.HOST);
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  const deadline = setTimeout(() => process.exit(1), 10_000);
  deadline.unref();
  server.close(async () => { await database.$disconnect(); clearTimeout(deadline); process.exit(0); });
}
process.on('SIGTERM', () => { void shutdown(); });
process.on('SIGINT', () => { void shutdown(); });
