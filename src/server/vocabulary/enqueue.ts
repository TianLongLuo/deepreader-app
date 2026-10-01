import type {Prisma} from '@prisma/client';
import type {LearningScope} from './types';
/** Called in the same capture transaction. No model or external I/O. */
export async function enqueueEnrichment(tx:Prisma.TransactionClient,scope:LearningScope,senseId:string,expectedRevision:number){
 await tx.enrichmentJob.upsert({where:{senseId_expectedRevision:{senseId,expectedRevision}},create:{...scope,senseId,expectedRevision},update:{}});
}
