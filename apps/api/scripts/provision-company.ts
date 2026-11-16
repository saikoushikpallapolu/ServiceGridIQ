import 'dotenv/config';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { createDatabase } from '../src/database.js';
import { parseConfig } from '../src/config.js';

const { values } = parseArgs({ options: {
  'owner-user-id': { type: 'string' }, name: { type: 'string' }, slug: { type: 'string' }, timezone: { type: 'string', default: 'Asia/Kolkata' },
} });
const input = z.object({ 'owner-user-id': z.uuid(), name: z.string().trim().min(1).max(150), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100), timezone: z.string() }).parse(values);
new Intl.DateTimeFormat('en', { timeZone: input.timezone });
const config = parseConfig(process.env);
if (config.AUTH_MODE === 'disabled') throw new Error('Configure a trusted OIDC provider before provisioning a company');
const database = createDatabase(config.DATABASE_URL);
try {
  const owner = await database.user.findUnique({ where: { id: input['owner-user-id'] } });
  if (!owner?.active || owner.issuer !== config.OIDC_ISSUER) throw new Error('The intended owner must first sign in through the configured provider');
  const organization = await database.$transaction(async (tx) => {
    const company = await tx.organization.create({ data: { name: input.name, slug: input.slug, timezone: input.timezone } });
    const membership = await tx.membership.create({ data: { organizationId: company.id, userId: owner.id, role: 'OWNER' } });
    await tx.auditEvent.create({ data: { organizationId: company.id, actorMembershipId: membership.id, action: 'COMPANY_PROVISIONED', targetId: company.id, details: { source: 'operator-cli' } } });
    return company;
  });
  console.log(`Company provisioned: ${organization.id}. Its verified owner can now select it after refreshing.`);
} finally { await database.$disconnect(); }
