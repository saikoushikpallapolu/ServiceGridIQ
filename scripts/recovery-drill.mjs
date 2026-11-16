import { spawn } from 'node:child_process';
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Local-only rehearsal: never restore over the working database.
const dir = resolve('.data/backups'); await mkdir(dir, { recursive: true });
const keyPath = resolve('.data/backup-encryption.key');
let key; try { key = await readFile(keyPath); } catch (error) { if (error.code !== 'ENOENT') throw error; key = randomBytes(32); await writeFile(keyPath, key, { flag: 'wx', mode: 0o600 }); }
if (key.length !== 32) throw new Error('Invalid local backup key');
const compose = ['compose', '--env-file', '.env', '-f', 'infrastructure/compose.yaml', 'exec', '-T', 'db'];
async function docker(args, input) { return new Promise((resolveRun, reject) => { const child = spawn('docker', [...compose, ...args], { shell: false, windowsHide: true }); const chunks = []; let errors = ''; child.stdout.on('data', (chunk) => chunks.push(chunk)); child.stderr.on('data', (chunk) => { errors += chunk; }); child.on('error', reject); child.on('close', (code) => code === 0 ? resolveRun(Buffer.concat(chunks)) : reject(new Error(`Recovery command failed (${code}); inspect PostgreSQL locally`))); child.stdin.on('error', () => {}); child.stdin.end(input); void errors; }); }
const counts = `SELECT json_build_object('jobs',(SELECT count(*) FROM jobs),'customers',(SELECT count(*) FROM customers),'audit',(SELECT count(*) FROM audit_events),'migrations',(SELECT count(*) FROM _prisma_migrations),'manuals',(SELECT count(*) FROM manual_documents),'chunks',(SELECT count(*) FROM manual_chunks),'stockMovements',(SELECT count(*) FROM stock_movements),'stockAllocations',(SELECT count(*) FROM stock_allocations),'stockBalances',(SELECT count(*) FROM stock_balances))`;
const before = JSON.parse(String(await docker(['sh', '-c', 'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "$1"', 'sh', counts])));
const dump = await docker(['sh', '-c', 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl']);
const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv); const encrypted = Buffer.concat([cipher.update(dump), cipher.final()]); const artifact = Buffer.concat([Buffer.from('SGIQB001'), iv, cipher.getAuthTag(), encrypted]);
const name = `sg_restore_${Date.now()}`; if (!/^sg_restore_[0-9]+$/.test(name)) throw new Error('Unsafe recovery database name');
const path = resolve(dir, `${name}.enc`); await writeFile(path, artifact, { flag: 'wx', mode: 0o600 });
const saved = await readFile(path); const decipher = createDecipheriv('aes-256-gcm', key, saved.subarray(8, 20)); decipher.setAuthTag(saved.subarray(20, 36)); const restored = Buffer.concat([decipher.update(saved.subarray(36)), decipher.final()]);
if (!createHash('sha256').update(dump).digest().equals(createHash('sha256').update(restored).digest())) throw new Error('Backup integrity mismatch');
const damaged = Buffer.from(saved); damaged[damaged.length - 1] ^= 1; let tamperRejected = false; try { const bad = createDecipheriv('aes-256-gcm', key, damaged.subarray(8, 20)); bad.setAuthTag(damaged.subarray(20, 36)); bad.update(damaged.subarray(36)); bad.final(); } catch { tamperRejected = true; }
if (!tamperRejected) throw new Error('Backup authentication check failed');
await docker(['sh', '-c', 'exec createdb -U "$POSTGRES_USER" "$1"', 'sh', name]);
const started = performance.now();
try {
  await docker(['sh', '-c', 'exec pg_restore -U "$POSTGRES_USER" -d "$1" --exit-on-error --no-owner --no-acl', 'sh', name], restored);
  const after = JSON.parse(String(await docker(['sh', '-c', 'exec psql -U "$POSTGRES_USER" -d "$1" -At -c "$2"', 'sh', name, counts])));
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Recovery counts differ; pause writes and repeat the drill');
  const inventorySql = "SELECT count(*) FROM stock_balances b LEFT JOIN (SELECT organization_id,part_id,location_id,sum(delta_on_hand) h,sum(delta_reserved) r,count(*) v FROM stock_movements GROUP BY organization_id,part_id,location_id) m USING(organization_id,part_id,location_id) LEFT JOIN (SELECT organization_id,part_id,location_id,sum(quantity-consumed) q FROM stock_allocations WHERE state='ACTIVE' GROUP BY organization_id,part_id,location_id) a USING(organization_id,part_id,location_id) WHERE b.on_hand <> coalesce(m.h,0) OR b.reserved <> coalesce(m.r,0) OR b.reserved <> coalesce(a.q,0) OR b.version <> coalesce(m.v,0)";
  const discrepancies = Number(String(await docker(['sh', '-c', 'exec psql -U "$POSTGRES_USER" -d "$1" -At -c "$2"', 'sh', name, inventorySql])).trim());
  if (discrepancies !== 0) throw new Error('Restored inventory does not reconcile; do not promote this database');
  const report = { checkedAt: new Date().toISOString(), encryptedBackup: path, counts: after, inventoryReconciled: true, restoreMilliseconds: Math.round(performance.now() - started), tamperRejected, liveDatabaseModified: false };
  await writeFile('.data/phase-8-recovery.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
} finally { await docker(['sh', '-c', 'exec dropdb -U "$POSTGRES_USER" "$1"', 'sh', name]); }
// Keep the encrypted archive and separate local key; no plaintext dump is written.
