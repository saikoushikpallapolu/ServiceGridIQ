import 'dotenv/config';
import { expect, it } from 'vitest';
import request from 'supertest';
import { createDatabase } from '../src/database.js';
import { createApp } from '../src/app.js';

it('queries real PostgreSQL and sees the explicitly seeded fictional organizations', async () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for integration tests');
  const database = createDatabase(process.env.DATABASE_URL);
  try {
    const app = createApp({ checkDatabase: async () => { await database.$queryRaw`SELECT 1`; }, logLevel: 'silent' });
    await request(app).get('/health/ready').expect(200);
    const rows = await database.organization.findMany({ where: { slug: { in: ['fictional-cooling-alpha', 'fictional-cooling-beta'] } } });
    expect(rows).toHaveLength(2);
  } finally { await database.$disconnect(); }
});
