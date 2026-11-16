import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const env = process.env;
for (const [key, pattern] of Object.entries({
  GITHUB_SHA: /^[a-f0-9]{40}$/, GITHUB_REPOSITORY: /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/,
  AWS_REGION: /^[a-z]{2}-[a-z]+-\d+$/, STAGING_INSTANCE_ID: /^i-[a-f0-9]+$/,
  API_IMAGE: /^\d{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com\/[a-z0-9/_-]+:sha-[a-f0-9]{40}$/,
  WEB_IMAGE: /^\d{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com\/[a-z0-9/_-]+:sha-[a-f0-9]{40}$/,
  DATABASE_SECRET_ARN: /^arn:aws:secretsmanager:[a-z0-9-]+:\d{12}:secret:[A-Za-z0-9/_+=.@-]+$/,
})) if (!env[key] || !pattern.test(env[key])) throw new Error(`Invalid or missing ${key}`);
const commands = [
  'set -eu',
  'mkdir -p /opt/servicegrid',
  `if [ ! -d /opt/servicegrid/source/.git ]; then git clone 'https://github.com/${env.GITHUB_REPOSITORY}.git' /opt/servicegrid/source; fi`,
  'cd /opt/servicegrid/source',
  `git fetch origin '${env.GITHUB_SHA}'`,
  `git checkout --detach '${env.GITHUB_SHA}'`,
  `bash infrastructure/aws/deploy.sh '${env.API_IMAGE}' '${env.WEB_IMAGE}' '${env.DATABASE_SECRET_ARN}' '${env.AWS_REGION}'`,
];
const file = join(tmpdir(), 'servicegrid-ssm-parameters.json');
writeFileSync(file, JSON.stringify({ commands }));
const call = (args) => execFileSync('aws', [...args, '--region', env.AWS_REGION], { encoding: 'utf8' }).trim();
const id = call(['ssm', 'send-command', '--instance-ids', env.STAGING_INSTANCE_ID, '--document-name', 'AWS-RunShellScript', '--parameters', `file://${file}`, '--query', 'Command.CommandId', '--output', 'text']);
for (let attempt = 0; attempt < 60; attempt++) {
  await new Promise((resolve) => setTimeout(resolve, 10_000));
  let status;
  try { status = call(['ssm', 'get-command-invocation', '--command-id', id, '--instance-id', env.STAGING_INSTANCE_ID, '--query', 'Status', '--output', 'text']); }
  catch { continue; }
  if (status === 'Success') { console.log(`Staging deployment ${id} succeeded.`); process.exit(0); }
  if (['Failed', 'TimedOut', 'Cancelled', 'Cancelling'].includes(status)) throw new Error(`Deployment ${id}: ${status}. Inspect SSM command output in AWS.`);
}
throw new Error(`Deployment ${id} did not complete within ten minutes. Inspect SSM before retrying.`);
