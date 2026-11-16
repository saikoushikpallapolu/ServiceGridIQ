import 'dotenv/config';
import { Worker } from 'bullmq';
import { z } from 'zod';
import { createDatabase } from '../database.js';
import { knowledgeDependencies } from './dependencies.js';
import { ingestDocument } from './ingestion.js';

const db = createDatabase(process.env.DATABASE_URL!); const deps = knowledgeDependencies();
const worker = new Worker('manual-ingestion', async (job) => { const data = z.object({ organizationId: z.uuid(), documentId: z.uuid(), revision: z.number().int().positive() }).parse(job.data); await ingestDocument(db, data, deps); }, { connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379', maxRetriesPerRequest: null }, concurrency: 2 });
worker.on('error', () => console.error('Ingestion worker dependency unavailable')); worker.on('failed', () => console.error('Ingestion task failed; inspect document status'));
let sweeping = false;
const sweep = async () => { if (sweeping) return; sweeping = true; try { const rows = await db.manualDocument.findMany({ where: { status: 'QUEUED' }, take: 100, orderBy: { updatedAt: 'asc' } }); for (const row of rows) await deps.enqueue({ organizationId: row.organizationId, documentId: row.id, revision: row.revision }); } catch { console.error('Ingestion recovery sweep unavailable'); } finally { sweeping = false; } };
const timer = setInterval(() => { void sweep(); }, 15000); void sweep();
let closing = false; const shutdown = async () => { if (closing) return; closing = true; clearInterval(timer); await worker.close(); await db.$disconnect(); process.exit(0); };
process.on('SIGINT', () => { void shutdown(); }); process.on('SIGTERM', () => { void shutdown(); });
