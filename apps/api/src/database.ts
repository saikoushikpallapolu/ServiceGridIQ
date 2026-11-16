import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

export function createDatabase(connectionString: string) {
  const adapter = new PrismaPg({ connectionString, connectionTimeoutMillis: 2000, query_timeout: 2000, max: 5 });
  return new PrismaClient({ adapter });
}
