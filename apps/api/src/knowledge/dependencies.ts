import { S3Client, PutObjectCommand, GetObjectCommand, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3';
import { Queue } from 'bullmq';

export interface KnowledgeStorage { put(key: string, data: Buffer, mediaType: string): Promise<void>; get(key: string): Promise<Buffer> }
export interface KnowledgeDependencies { storage: KnowledgeStorage; enqueue(data: { organizationId: string; documentId: string; revision: number }): Promise<void> }
let instance: KnowledgeDependencies | undefined;
export function knowledgeDependencies(): KnowledgeDependencies {
  if (instance) return instance;
  const client = new S3Client({ endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000', region: process.env.S3_REGION ?? 'us-east-1', forcePathStyle: true, credentials: { accessKeyId: process.env.S3_ACCESS_KEY ?? '', secretAccessKey: process.env.S3_SECRET_KEY ?? '' }, requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' });
  const Bucket = process.env.S3_BUCKET ?? 'servicegrid-manuals'; let ready = false; let queue: Queue | undefined;
  const ensure = async () => { if (ready) return; try { await client.send(new HeadBucketCommand({ Bucket })); } catch { try { await client.send(new CreateBucketCommand({ Bucket })); } catch (error) { if (!(error instanceof Error && ['BucketAlreadyOwnedByYou', 'BucketAlreadyExists'].includes(error.name))) throw error; } } ready = true; };
  instance = { storage: { put: async (Key, Body, ContentType) => { await ensure(); await client.send(new PutObjectCommand({ Bucket, Key, Body, ContentType })); }, get: async (Key) => { const response = await client.send(new GetObjectCommand({ Bucket, Key })); if (!response.Body) throw new Error('MANUAL_OBJECT_MISSING'); return Buffer.from(await response.Body.transformToByteArray()); } }, enqueue: async (data) => { queue ??= new Queue('manual-ingestion', { connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379', maxRetriesPerRequest: 1, enableOfflineQueue: false }, defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: 100, removeOnFail: 100 } }); if (queue.listenerCount('error') === 0) queue.on('error', () => {}); await queue.add('ingest', data, { jobId: `${data.documentId}-${data.revision}` }); } };
  return instance;
}
