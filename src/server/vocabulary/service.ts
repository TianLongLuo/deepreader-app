import type {PrismaClient,Prisma,ReadingEntry} from '@prisma/client';
import {createEmptyCard} from 'ts-fsrs';
import {enqueueEnrichment} from './enqueue';
import {prisma} from '@/lib/prisma';
import {parseSavedWord} from '@/lib/saved-word';
import {z} from 'zod';
import {activeDocument,VocabularyError} from './scope';
import {createVocabularyQuery,vocabularyWhere} from './query';
export {activeDocument,VocabularyError} from './scope';
import type {LearningScope} from './types';
export const vocabularyEditSchema=z.object({revision:z.number().int().nonnegative(),manualMeaning:z.object({en:z.string().max(2000).nullable().optional(),zh:z.string().max(2000).nullable().optional()}).strict().optional(),manualTags:z.array(z.string().min(1).max(100)).max(12).nullable().optional(),priority:z.number().int().min(0).max(3).optional()}).strict();
const suggestionSchema=z.object({lemma:z.string().min(1).max(200).optional(),meaningEn:z.string().max(2000).optional(),meaningZh:z.string().max(2000).optional(),pos:z.string().max(80).optional(),semanticCategory:z.string().max(80).optional(),domain:z.string().max(100).nullable().optional(),tagsJson:z.string().max(2000).optional(),collocationsJson:z.string().max(2000).optional(),status:z.enum(['unresolved','ready','failed']).optional()}).strict();
export function createVocabularyService(database:PrismaClient,options:{authorizeSuggestion?:(scope:LearningScope,id:string,revision:number)=>Promise<boolean>}={}){
 const captureIn=async(scope:LearningScope,entry:ReadingEntry,tx:Prisma.TransactionClient)=>{
  const found=await tx.readingEntry.findFirst({where:{id:entry.id,userId:scope.userId,kind:'word',document:{workspaceId:scope.workspaceId,...activeDocument}}});
  if(!found||found.userId!==entry.userId||found.documentId!==entry.documentId||entry.kind!=='word'||found.text!==entry.text||found.note!==entry.note)throw new VocabularyError('Word not found',404);
  const existing=await tx.vocabularyEncounter.findUnique({where:{readingEntryId:found.id},select:{id:true,senseId:true}});
  if(existing)return {senseId:existing.senseId,encounterId:existing.id};
  const evidence=parseSavedWord(found.note,found.text),lemma=found.text.normalize('NFC').toLocaleLowerCase(evidence.sourceLanguage),senseKey='unresolved:'+found.id;
  const sense=await tx.vocabularySense.create({data:{...scope,sourceLanguage:evidence.sourceLanguage,lemma,senseKey,meaningEn:evidence.meaning.en||'',meaningZh:evidence.meaning.zh||'',encounterContext:evidence.context}});
  const encounter=await tx.vocabularyEncounter.create({data:{...scope,senseId:sense.id,readingEntryId:found.id,documentId:found.documentId,location:found.location,surface:found.text,targetSentence:evidence.targetSentence,context:evidence.context,rawNote:found.note,legacyContextMeaning:evidence.legacyContextMeaning,dictionaryJson:JSON.stringify(evidence.dictionary),phonetic:evidence.phonetic,createdAt:found.createdAt}});
  const due=found.reviewAt??new Date(),state=createEmptyCard(due);
  await tx.reviewCard.create({data:{senseId:sense.id,stateJson:JSON.stringify(state),due}});
  await enqueueEnrichment(tx,scope,sense.id,sense.revision);
  return {senseId:sense.id,encounterId:encounter.id};
 };
 const requireSense=async(scope:LearningScope,id:string)=>{const sense=await database.vocabularySense.findFirst({where:{id,...vocabularyWhere(scope)},select:{id:true,revision:true}});if(!sense)throw new VocabularyError('词条不存在',404);return sense;};
 const edit=async(scope:LearningScope,id:string,input:unknown)=>{
  const data=vocabularyEditSchema.parse(input);await requireSense(scope,id);
  const result=await database.vocabularySense.updateMany({where:{id,...vocabularyWhere(scope),revision:data.revision},data:{...(data.manualMeaning?.en!==undefined?{manualMeaningEn:data.manualMeaning.en}:{}),...(data.manualMeaning?.zh!==undefined?{manualMeaningZh:data.manualMeaning.zh}:{}),...(data.manualTags!==undefined?{manualTagsJson:data.manualTags===null?null:JSON.stringify(data.manualTags)}:{}),...(data.priority!==undefined?{priority:data.priority}:{}),revision:{increment:1}}});
  if(result.count!==1)throw new VocabularyError('词条已更新，请刷新后再修改',409);
  return {id,revision:data.revision+1};
 };
 const applySuggestion=async(scope:LearningScope,id:string,revision:number,input:unknown)=>{
  const data=suggestionSchema.parse(input),sense=await requireSense(scope,id);
  if(sense.revision!==revision)throw new VocabularyError('整理结果已过期',409);
  if(!await options.authorizeSuggestion?.(scope,id,revision))throw new VocabularyError('整理任务尚未验证',403);
  const result=await database.vocabularySense.updateMany({where:{id,...vocabularyWhere(scope),revision},data:{...data,revision:{increment:1}}});if(result.count!==1)throw new VocabularyError('整理结果已过期',409);
  return {id,revision:revision+1};
 };
 const remove=async(scope:LearningScope,id:string)=>database.$transaction(async tx=>{
  const sense=await tx.vocabularySense.findFirst({where:{id,...vocabularyWhere(scope)},select:{id:true,encounters:{select:{readingEntryId:true,userId:true,workspaceId:true}}}});if(!sense)throw new VocabularyError('词条不存在',404);
  if(sense.encounters.some(e=>e.userId!==scope.userId||e.workspaceId!==scope.workspaceId))throw new VocabularyError('出处归属不一致',409);
  await tx.readingEntry.deleteMany({where:{id:{in:sense.encounters.map(e=>e.readingEntryId)},userId:scope.userId,kind:'word',document:{workspaceId:scope.workspaceId}}});
  await tx.vocabularySense.delete({where:{id}});return {id};
 });
 return {...createVocabularyQuery(database),edit,applySuggestion,remove,capture:(scope:LearningScope,entry:ReadingEntry,tx?:Prisma.TransactionClient)=>tx?captureIn(scope,entry,tx):database.$transaction(db=>captureIn(scope,entry,db))};
}
export const vocabularyService=createVocabularyService(prisma);
