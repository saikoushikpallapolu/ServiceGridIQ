import 'dotenv/config';
import { createDatabase } from '../src/database.js';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const database = createDatabase(process.env.DATABASE_URL);
try {
  for (const [id, slug, name] of [
    ['00000000-0000-4000-8000-000000000001', 'fictional-cooling-alpha', 'Fictional Cooling Alpha'],
    ['00000000-0000-4000-8000-000000000002', 'fictional-cooling-beta', 'Fictional Cooling Beta'],
  ]) {
    await database.organization.upsert({ where: { slug: slug! }, create: { id: id!, slug: slug!, name: name! }, update: {} });
  }
  if (process.env.SEED_LOCAL_IDENTITIES === 'true') {
    const issuer = 'http://localhost:8082/realms/servicegrid';
    const profiles = [
      ['10000000-0000-4000-8000-000000000001', 'owner.alpha@example.test', 'Alpha Owner'],
      ['10000000-0000-4000-8000-000000000002', 'dispatcher.alpha@example.test', 'Alpha Dispatcher'],
      ['10000000-0000-4000-8000-000000000003', 'technician.alpha@example.test', 'Alpha Technician'],
      ['10000000-0000-4000-8000-000000000004', 'owner.beta@example.test', 'Beta Owner'],
    ] as const;
    const alpha = '00000000-0000-4000-8000-000000000001';
    const beta = '00000000-0000-4000-8000-000000000002';
    for (const [subject, email, name] of profiles) {
      const user = await database.user.upsert({ where: { issuer_subject: { issuer, subject } }, create: { issuer, subject, email, name }, update: {} });
      const organizationId = email === 'owner.beta@example.test' ? beta : alpha;
      const role = email.startsWith('owner.') ? 'OWNER' : email.startsWith('dispatcher.') ? 'DISPATCHER' : 'TECHNICIAN';
      await database.membership.upsert({ where: { organizationId_userId: { organizationId, userId: user.id } }, create: { organizationId, userId: user.id, role }, update: {} });
      if (email === 'owner.alpha@example.test') await database.membership.upsert({ where: { organizationId_userId: { organizationId: beta, userId: user.id } }, create: { organizationId: beta, userId: user.id, role: 'DISPATCHER' }, update: {} });
    }
    for (const [organizationId, suffix] of [[alpha, '001'], [beta, '002']] as const) {
      const customerId = `20000000-0000-4000-8000-000000000${suffix}`;
      const siteId = `30000000-0000-4000-8000-000000000${suffix}`;
      const equipmentId = `40000000-0000-4000-8000-000000000${suffix}`;
      const jobId = `50000000-0000-4000-8000-000000000${suffix}`;
      await database.customer.upsert({ where: { id: customerId }, create: { id: customerId, organizationId, name: `Fictional Bakery ${suffix}`, email: `bakery-${suffix}@example.test`, phone: '555-0100' }, update: {} });
      await database.serviceSite.upsert({ where: { id: siteId }, create: { id: siteId, organizationId, customerId, name: 'Demo kitchen', address: '100 Fictional Street, Demo City', accessNotes: 'Fictional demo: check in at reception.' }, update: {} });
      await database.equipment.upsert({ where: { id: equipmentId }, create: { id: equipmentId, organizationId, siteId, manufacturer: 'Fictional Cooling', model: 'Demo 100', serialNumber: `DEMO-${suffix}`, notes: 'Fictional equipment. No manufacturer guidance is implied.' }, update: {} });
      await database.job.upsert({ where: { id: jobId }, create: { id: jobId, organizationId, customerId, siteId, equipmentId, complaint: 'Fictional demo: cooling temperature fluctuates.', priority: 'NORMAL', arrivalStart: new Date('2026-12-01T03:30:00Z'), arrivalEnd: new Date('2026-12-01T06:30:00Z'), estimatedDurationMinutes: 60, travelBufferMinutes: 30 }, update: {} });
      const owner = await database.membership.findFirst({ where: { organizationId, role: 'OWNER', active: true } });
      if (owner && !await database.jobEvent.findFirst({ where: { organizationId, jobId } })) {
        await database.jobEvent.create({ data: { organizationId, jobId, actorMembershipId: owner.id, kind: 'DEMO_SEEDED', note: 'Fictional demonstration intake seeded by local setup.', details: { source: 'local-seed' } } });
      }
    }
    console.log('Local-only fictional identities and memberships seeded. Existing roles/revocations were preserved.');
  }
  console.log('Two fictional organizations seeded. No public organization API is enabled.');
} finally { await database.$disconnect(); }
