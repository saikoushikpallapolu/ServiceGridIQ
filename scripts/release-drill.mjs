import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const docker = (...args) => { const result = spawnSync('docker', args, { shell: false, windowsHide: true, encoding: 'utf8' }); if (result.status !== 0) throw new Error('Local release rehearsal failed; inspect Docker locally'); return result.stdout.trim(); };
const compose = ['compose', '--env-file', '.env', '-f', 'infrastructure/compose.yaml'];
const images = {};
for (const service of ['api', 'web']) { const id = docker(...compose, 'ps', '-q', service); if (!/^[a-f0-9]{12,64}$/.test(id)) throw new Error('Start the local app before the release drill'); const reference = docker('inspect', '--format', '{{.Config.Image}}', id); images[service] = docker('image', 'inspect', '--format', '{{.Id}}', reference); if (!/^sha256:[a-f0-9]{64}$/.test(images[service])) throw new Error('Invalid immutable image ID'); }
for (const [service, image] of Object.entries(images)) docker('tag', image, `servicegrid-recovery-${service}:${image.slice(7)}`);
const override = '.data/rollback.compose.json'; writeFileSync(override, JSON.stringify({ services: Object.fromEntries(Object.entries(images).map(([service, image]) => [service, { image: `servicegrid-recovery-${service}:${image.slice(7)}`, pull_policy: 'never' }])) }, null, 2));
// Recreate from exact existing image IDs; migrations are deliberately not rolled back.
docker(...compose, '-f', override, 'up', '-d', '--no-build', '--no-deps', '--force-recreate', '--wait', '--wait-timeout', '120', 'api', 'web');
const response = await fetch('http://localhost:8080/health/ready', { signal: AbortSignal.timeout(10000) }); if (!response.ok) throw new Error('Immutable-image rollback smoke failed');
const report = { checkedAt: new Date().toISOString(), images, ready: true, scope: 'Local same-version immutable-image recreation; cross-version rollback requires staging and expand/contract migrations', databaseRolledBack: false }; writeFileSync('.data/phase-8-release.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
