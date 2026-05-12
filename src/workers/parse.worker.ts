import { Worker } from 'bullmq';
import { redis } from '@/lib/redis';
import { createChildLogger } from '@/lib/logger';
import { PARSE_QUEUE } from '../server/jobs/queue';
import { parsingService } from '../server/parsing/parsing.service';
import { prisma } from '@/lib/prisma';

const log = createChildLogger('parse-worker');

export const parseWorker = new Worker(
  PARSE_QUEUE,
  async (job) => {
    const { documentId, jobId } = job.data;
    
    log.info({ documentId, jobId, attempt: job.attemptsMade }, 'Processing parse job');

    try {
      await prisma.aIJob.update({
        where: { id: jobId },
        data: { 
          status: 'PROCESSING',
          attemptCount: job.attemptsMade + 1
        }
      });

      await parsingService.processDocument(documentId);

      await prisma.aIJob.update({
        where: { id: jobId },
        data: { status: 'COMPLETED' }
      });
      
      return { success: true };
    } catch (error) {
      log.error({ documentId, jobId, error }, 'Parse job failed');
      
      await prisma.aIJob.update({
        where: { id: jobId },
        data: { 
          status: 'FAILED',
          errorMessage: (error as Error).message
        }
      });
      
      throw error;
    }
  },
  { 
    connection: redis,
    concurrency: 5 // Run up to 5 parses concurrently
  }
);

parseWorker.on('failed', (job, err) => {
  log.error({ jobId: job?.id, error: err }, 'Worker reported job failure');
});

log.info('Parse worker initialized');
