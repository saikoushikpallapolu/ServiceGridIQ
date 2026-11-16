import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
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
const rootText = readFileSync(envPath, 'utf8');
if (!/^KEYCLOAK_ADMIN_PASSWORD=/m.test(rootText)) appendFileSync(envPath, `\nKEYCLOAK_ADMIN_PASSWORD=${randomBytes(24).toString('hex')}\n`);
else if (/^KEYCLOAK_ADMIN_PASSWORD=(CHANGE_ME|.{0,23})\r?$/m.test(rootText)) throw new Error('Replace the local identity admin password placeholder with a random value of at least 24 characters');
if (!/^AUTH_MODE=/m.test(readFileSync(apiPath, 'utf8'))) appendFileSync(apiPath, '\nAUTH_MODE=local\nPUBLIC_ORIGIN=http://localhost:5173\nOIDC_ISSUER=http://localhost:8082/realms/servicegrid\nOIDC_CLIENT_ID=servicegrid-web\n');
if (!/^SEED_LOCAL_IDENTITIES=/m.test(readFileSync(apiPath, 'utf8'))) appendFileSync(apiPath, 'SEED_LOCAL_IDENTITIES=true\n');
const data = resolve(root, '.data/keycloak');
mkdirSync(data, { recursive: true });
const credentialsPath = resolve(root, '.data/local-accounts.json');
const realmPath = resolve(data, 'servicegrid-realm.json');
if (!existsSync(credentialsPath) && !existsSync(realmPath)) {
  const realm = JSON.parse(readFileSync(resolve(root, 'infrastructure/auth/realm.template.json'), 'utf8'));
  const accounts = realm.users.map((user) => {
    const password = randomBytes(18).toString('base64url');
    user.credentials = [{ type: 'password', value: password, temporary: false }];
    return { email: user.email, password };
  });
  // The development container's UID must be able to read its read-only import file.
  writeFileSync(realmPath, JSON.stringify(realm, null, 2), { mode: 0o644, flag: 'wx' });
  writeFileSync(credentialsPath, JSON.stringify(accounts, null, 2), { mode: 0o600, flag: 'wx' });
} else if (!existsSync(credentialsPath) || !existsSync(realmPath)) {
  throw new Error('Local identity files are incomplete. Restore .data from your local backup; do not reset an existing identity volume silently.');
}
for (const key of ['S3_ACCESS_KEY', 'S3_SECRET_KEY', 'REDIS_PASSWORD']) if (!new RegExp(`^${key}=`, 'm').test(readFileSync(envPath, 'utf8'))) appendFileSync(envPath, `${key}=${randomBytes(24).toString('hex')}\n`);
const extended = Object.fromEntries(readFileSync(envPath, 'utf8').split(/\r?\n/).filter((line) => line.includes('=') && !line.startsWith('#')).map((line) => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]; }));
mkdirSync(resolve(root, '.data/storage'), { recursive: true });
writeFileSync(resolve(root, '.data/storage/s3.json'), JSON.stringify({ identities: [{ name: 'servicegrid-local', credentials: [{ accessKey: extended.S3_ACCESS_KEY, secretKey: extended.S3_SECRET_KEY }], actions: ['Admin', 'Read', 'List', 'Write', 'Tagging'] }] }), { mode: 0o644 });
for (const [key, value] of Object.entries({ S3_ACCESS_KEY: extended.S3_ACCESS_KEY, S3_SECRET_KEY: extended.S3_SECRET_KEY, S3_ENDPOINT: 'http://localhost:9000', S3_BUCKET: 'servicegrid-manuals', REDIS_URL: `redis://:${extended.REDIS_PASSWORD}@localhost:6379` })) if (!new RegExp(`^${key}=`, 'm').test(readFileSync(apiPath, 'utf8'))) appendFileSync(apiPath, `${key}=${value}\n`);
console.log('Local environment files are ready. Existing files were preserved; credentials were not printed.');
