import { createApp } from './app.js';
import { parseConfig } from './config.js';
import { createDatabase } from './database.js';
import { createAuthRouter } from './auth/router.js';
import { createIdentityProvider } from './auth/oidc.js';
import { purgeExpiredImports } from './onboarding/service.js';

const config = parseConfig(process.env);
const database = createDatabase(config.DATABASE_URL);
const app = createApp({ checkDatabase: async () => { await database.$queryRaw`SELECT 1`; }, logLevel: config.LOG_LEVEL,
  authRouter: createAuthRouter(database, config, createIdentityProvider(config)) });
const server = app.listen(config.PORT, config.HOST);
// Raw import contents expire after 24 hours; retain only safe provenance metadata.
const purge = () => { void purgeExpiredImports(database).catch(() => { console.error('Import retention cleanup failed'); }); };
purge();
const retentionTimer = setInterval(purge, 15 * 60_000);
retentionTimer.unref();
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  clearInterval(retentionTimer);
  const deadline = setTimeout(() => process.exit(1), 10_000);
  deadline.unref();
  server.close(async () => { await database.$disconnect(); clearTimeout(deadline); process.exit(0); });
}
process.on('SIGTERM', () => { void shutdown(); });
process.on('SIGINT', () => { void shutdown(); });
