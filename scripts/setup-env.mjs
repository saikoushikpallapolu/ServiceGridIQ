import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env');
if (!existsSync(envPath)) {
  const password = randomBytes(24).toString('hex');
  writeFileSync(envPath, `POSTGRES_USER=servicegrid\nPOSTGRES_PASSWORD=${password}\nPOSTGRES_DB=servicegrid\nPOSTGRES_PORT=5432\nWEB_PORT=8080\n`, { flag: 'wx', mode: 0o600 });
}
const config = Object.fromEntries(readFileSync(envPath, 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#')).map((line) => { const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1)]; }));
const apiPath = resolve(root, 'apps/api/.env');
if (!existsSync(apiPath)) {
  for (const key of ['POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB']) if (!config[key] || config[key] === 'CHANGE_ME') throw new Error(`Set a local value for ${key} in .env`);
  const url = `postgresql://${encodeURIComponent(config.POSTGRES_USER)}:${encodeURIComponent(config.POSTGRES_PASSWORD)}@localhost:${config.POSTGRES_PORT ?? '5432'}/${encodeURIComponent(config.POSTGRES_DB)}`;
  writeFileSync(apiPath, `NODE_ENV=development\nPORT=3001\nHOST=0.0.0.0\nLOG_LEVEL=info\nDATABASE_URL=${url}\n`, { flag: 'wx', mode: 0o600 });
}
console.log('Local environment files are ready. Existing files were preserved; credentials were not printed.');
