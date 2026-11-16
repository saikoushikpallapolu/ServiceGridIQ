import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { KnowledgeDependencies } from './dependencies.js';
import { extractPages, chunkPages, fileHash } from './extract.js';
import { OpenAiProvider } from './provider.js';

export async function ingestDocument(db: PrismaClient, data: { organizationId: string; documentId: string; revision: number }, deps: KnowledgeDependencies, provider = new OpenAiProvider(db)) {
  const { organizationId, documentId, revision } = data;
  const doc = await db.manualDocument.findFirst({ where: { organizationId, id: documentId, revision, status: { in: ['QUEUED', 'PROCESSING', 'FAILED'] }, approvedById: { not: null } } }); if (!doc) return;
  const claimed = await db.manualDocument.updateMany({ where: { organizationId, id: documentId, revision, status: { not: 'REVOKED' } }, data: { status: 'PROCESSING', failureCode: null } }); if (!claimed.count) return;
  try {
    const bytes = await deps.storage.get(doc.objectKey); if (fileHash(bytes) !== doc.fileHash) throw new Error('MANUAL_HASH_MISMATCH');
    const pages = await extractPages(bytes, doc.mediaType); const chunks = chunkPages(pages).map((chunk) => ({ ...chunk, id: randomUUID() }));
    let vectors: number[][] | null = null; let fallback = false;
    if (doc.allowExternalAi && provider.enabled) { try { vectors = []; for (let offset = 0; offset < chunks.length; offset += 32) vectors.push(...await provider.embed(organizationId, chunks.slice(offset, offset + 32).map((chunk) => chunk.content))); } catch { vectors = null; fallback = true; } }
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${organizationId}::uuid FOR UPDATE`;
      const current = await tx.manualDocument.findFirst({ where: { organizationId, id: documentId, revision, status: { in: ['PROCESSING', 'QUEUED', 'FAILED'] }, approver: { active: true, role: 'OWNER', user: { active: true } } } }); if (!current) return;
      await tx.manualChunk.deleteMany({ where: { organizationId, documentId } });
      await tx.manualChunk.createMany({ data: chunks.map((chunk) => ({ ...chunk, organizationId, documentId, revision, embeddingModel: vectors ? 'text-embedding-3-small' : null })) });
      if (vectors) for (let i = 0; i < chunks.length; i++) await tx.$executeRaw`UPDATE manual_chunks SET embedding = ${JSON.stringify(vectors[i])}::vector WHERE organization_id = ${organizationId}::uuid AND id = ${chunks[i]!.id}::uuid`;
      await tx.manualDocument.update({ where: { id: documentId }, data: { status: 'READY', pages: pages.length, failureCode: fallback ? 'EMBEDDING_UNAVAILABLE_LEXICAL_READY' : null } });
      await tx.auditEvent.create({ data: { organizationId, actorMembershipId: current.approvedById!, action: 'MANUAL_INDEXED', targetId: documentId, details: { revision, chunks: chunks.length, pages: pages.length, vectorIndexed: !!vectors } } });
    }, { timeout: 60000 });
  } catch { await db.manualDocument.updateMany({ where: { organizationId, id: documentId, revision, status: { not: 'REVOKED' } }, data: { status: 'FAILED', failureCode: 'EXTRACTION_OR_STORAGE_FAILED' } }); throw new Error('INGESTION_FAILED'); }
}
