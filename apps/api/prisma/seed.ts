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
  console.log('Two fictional organizations seeded. No public organization API is enabled.');
} finally { await database.$disconnect(); }
