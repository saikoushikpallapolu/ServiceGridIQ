import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const env = require('dotenv').parse(readFileSync('.env'));
const url = new URL('postgresql://localhost'); url.username = env.POSTGRES_USER ?? 'servicegrid'; url.password = env.POSTGRES_PASSWORD; url.port = process.env.POSTGRES_PORT ?? env.POSTGRES_PORT ?? '5432'; url.pathname = `/${env.POSTGRES_DB ?? 'servicegrid'}`;
const child = spawn(process.execPath, [require.resolve('tsx/cli'), 'scripts/load-check.ts'], { cwd: resolve('apps/api'), env: { ...process.env, LOAD_DATABASE_URL: url.href }, stdio: 'inherit', shell: false, windowsHide: true });
child.on('error', () => { console.error('Unable to start local load rehearsal'); process.exitCode = 1; }); child.on('exit', (code) => { process.exitCode = code ?? 1; });
