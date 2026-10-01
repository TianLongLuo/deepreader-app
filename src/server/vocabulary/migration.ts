import type {PrismaClient} from '@prisma/client';
import type {LearningScope} from './types';
import {activeDocument,createVocabularyService} from './service';
/** Bounded cursor batches; one entry transaction; reruns never replace existing learning state. */
export async function migrateSavedWords(prisma:PrismaClient,scope?:LearningScope){
 const result={read:0,linked:0,unresolved:0},service=createVocabularyService(prisma);let cursor:string|undefined;
 for(;;){
  const entries=await prisma.readingEntry.findMany({where:{kind:'word',...(scope?{userId:scope.userId}:{}),document:{...activeDocument,...(scope?{workspaceId:scope.workspaceId}:{})}},include:{document:{select:{workspaceId:true}},vocabularyEncounter:{select:{id:true}}},orderBy:{id:'asc'},take:100,...(cursor?{cursor:{id:cursor},skip:1}:{})});
  if(!entries.length)break;
  for(const entry of entries){result.read++;if(entry.vocabularyEncounter)continue;await service.capture({userId:entry.userId,workspaceId:entry.document.workspaceId},entry);result.linked++;result.unresolved++;}
  cursor=entries.at(-1)!.id;
 }
 return result;
}
