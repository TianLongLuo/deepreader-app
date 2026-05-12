import { Queue, Worker, QueueEvents } from 'bullmq';
import { redis } from '@/lib/redis';
import { createChildLogger } from '@/lib/logger';
import { parsingService } from '../parsing/parsing.service';
import { prisma } from '@/lib/prisma';

const log = createChildLogger('job-queue');

// Define queues
export const PARSE_QUEUE = 'document-parse-queue';
export const EXPLAIN_QUEUE = 'paragraph-explain-queue'; // For future async explanations (batch)

// Initialize Queues
export const parseQueue = new Queue(PARSE_QUEUE, { connection: redis });
export const explainQueue = new Queue(EXPLAIN_QUEUE, { connection: redis });

/**
 * Enqueue a document for parsing.
 */
export async function enqueueDocumentParse(workspaceId: string, documentId: string) {
  // Create job record in DB
  const dbJob = await prisma.aIJob.create({
    data: {
      workspaceId,
      jobType: 'PARSE_DOCUMENT',
      targetId: documentId,
      status: 'QUEUED',
    }
  });

  // Add to redis queue
  await parseQueue.add(
    'parse-document', 
    { documentId, workspaceId, jobId: dbJob.id },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
      removeOnFail: false
    }
  );

  log.info({ documentId, jobId: dbJob.id }, 'Enqueued document parse job');
  return dbJob.id;
}
