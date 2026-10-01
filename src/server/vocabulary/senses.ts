import {createHash,randomUUID} from 'node:crypto';
import type {Prisma,PrismaClient,VocabularySense} from '@prisma/client';
import {createEmptyCard} from 'ts-fsrs';
import {z} from 'zod';
import {lookupDictionary,DictionaryError} from '@/server/reading-assistant/dictionary';
import {enrichmentResultSchema,type EnrichmentResult} from '@/lib/vocabulary-taxonomy';
import {vocabularyWhere} from './query';
import {VocabularyError} from './scope';
import {enqueueEnrichment} from './enqueue';
import type {LearningScope,SourceLanguage} from './types';
export type DictionarySenseCandidate={id:string;lemma:string;pos:string;definition:string;datasetVersion:string};
export function dictionarySenseId(datasetVersion:string,lemma:string,pos:string,definition:string){return createHash('sha256').update(JSON.stringify([datasetVersion,lemma.normalize('NFC'),pos,definition.normalize('NFC')])).digest('hex');}
export async function dictionarySenseCandidates(lemma:string,language:SourceLanguage,signal?:AbortSignal):Promise<DictionarySenseCandidate[]>{
 try{const entry=await lookupDictionary(lemma,signal,language,'en'),version=entry.datasetVersion||'unknown';return entry.meanings.flatMap(m=>m.definitions.map(d=>({id:dictionarySenseId(version,lemma,m.partOfSpeech,d.definition),lemma,pos:m.partOfSpeech,definition:d.definition,datasetVersion:version}))).slice(0,24);}
 catch(error){signal?.throwIfAborted();if(error instanceof DictionaryError&&error.status===404||error instanceof z.ZodError)return [];throw error;}
}
const sourceWhere=(scope:LearningScope)=>({...scope,readingEntry:{userId:scope.userId,kind:'word',document:{workspaceId:scope.workspaceId}}});
function compatible(a:VocabularySense,b:VocabularySense){return (['manualMeaningEn','manualMeaningZh','manualTagsJson'] as const).every(key=>a[key]===null||b[key]===null||a[key]===b[key]);}
async function requireSense(tx:Prisma.TransactionClient,scope:LearningScope,id:string){
 const sense=await tx.vocabularySense.findFirst({where:{id,...vocabularyWhere(scope)},include:{encounters:{select:{id:true,userId:true,workspaceId:true,readingEntry:{select:{userId:true,kind:true,document:{select:{workspaceId:true}}}}}}}});
 if(!sense)throw new VocabularyError('义项不存在',404);
 if(sense.encounters.some(e=>e.userId!==scope.userId||e.workspaceId!==scope.workspaceId||e.readingEntry.userId!==scope.userId||e.readingEntry.kind!=='word'||e.readingEntry.document.workspaceId!==scope.workspaceId))throw new VocabularyError('出处归属不一致',409);
 return sense;
}
async function cancelOldJobs(tx:Prisma.TransactionClient,ids:string[],protectJobId?:string){await tx.enrichmentJob.updateMany({where:{senseId:{in:ids},status:{in:['queued','running']},...(protectJobId?{id:{not:protectJobId}}:{})},data:{status:'failed',errorCode:'REVISION_CONFLICT',leaseUntil:null,leaseToken:null,progressJson:'{}',eventVersion:{increment:1}}});}
/** Keep the target schedule and archive source cards on their original senses. Never rewrite logs. */
async function mergeIn(tx:Prisma.TransactionClient,scope:LearningScope,sourceIds:string[],targetId:string,automatic=false,protectJobId?:string){
 if(!sourceIds.length||sourceIds.length>20||new Set(sourceIds).size!==sourceIds.length||sourceIds.includes(targetId))throw new VocabularyError('合并范围不正确',400);
 const target=await requireSense(tx,scope,targetId),sources:Array<Awaited<ReturnType<typeof requireSense>>>=[];
 for(const id of sourceIds){const source=await requireSense(tx,scope,id);if(source.lemma!==target.lemma||source.sourceLanguage!==target.sourceLanguage)throw new VocabularyError('仅合并同语言、同词形的义项',400);if(!compatible(target,source)||sources.some(other=>!compatible(other,source)))throw new VocabularyError('人工修订冲突，请先确认释义与标签',409);sources.push(source);}
 const encounterIds=sources.flatMap(s=>s.encounters.map(e=>e.id));
 // Fill only missing manual fields; compatible source corrections remain effective.
 const manual={manualMeaningEn:target.manualMeaningEn??sources.find(s=>s.manualMeaningEn!==null)?.manualMeaningEn??null,manualMeaningZh:target.manualMeaningZh??sources.find(s=>s.manualMeaningZh!==null)?.manualMeaningZh??null,manualTagsJson:target.manualTagsJson??sources.find(s=>s.manualTagsJson!==null)?.manualTagsJson??null};
 await tx.vocabularyEncounter.updateMany({where:{id:{in:encounterIds},...sourceWhere(scope)},data:{senseId:targetId}});
 await tx.reviewCard.updateMany({where:{senseId:{in:sourceIds},archivedAt:null},data:{archivedAt:new Date(),version:{increment:1}}});
 for(const source of sources)await tx.vocabularySense.update({where:{id:source.id},data:{status:'merged',senseKey:'merged:'+source.id,revision:{increment:1}}});
 await tx.vocabularySense.update({where:{id:targetId},data:{...manual,revision:{increment:1}}});
 await cancelOldJobs(tx,[targetId,...sourceIds],protectJobId);
 await tx.senseChange.create({data:{...scope,action:automatic?'auto-merge':'merge',sourceIdsJson:JSON.stringify(sourceIds),targetId,encounterIdsJson:JSON.stringify(encounterIds),detailJson:JSON.stringify({retainedSchedule:'target',sourceRevisions:sources.map(s=>({id:s.id,revision:s.revision})),targetRevision:target.revision,manualSnapshots:[target,...sources].map(s=>({id:s.id,meaningEn:s.manualMeaningEn,meaningZh:s.manualMeaningZh,tagsJson:s.manualTagsJson}))})}});
 return {targetId,merged:true};
}
/** Internal transaction entry; candidates are obtained by server lookup, never HTTP input. */
export async function resolveSenseIn(tx:Prisma.TransactionClient,scope:LearningScope,senseId:string,input:EnrichmentResult,expectedRevision:number,candidates:DictionarySenseCandidate[],protectJobId?:string){
 const result=enrichmentResultSchema.parse(input),source=await requireSense(tx,scope,senseId);if(source.revision!==expectedRevision)throw new VocabularyError('义项修订冲突',409);
 if(result.lemma.normalize('NFC').toLocaleLowerCase(source.sourceLanguage)!==source.lemma)throw new VocabularyError('候选词形不一致',400);
 const selected=result.selectedDictionarySenseId;
 if(selected&&!candidates.some(c=>c.id===selected&&c.lemma===source.lemma))throw new VocabularyError('词典义项未通过来源校验',400);
 if(!selected||result.uncertain){await tx.vocabularySense.update({where:{id:senseId},data:{confirmedDictionaryId:null,senseKey:'unresolved:'+senseId,status:'unresolved',revision:{increment:1}}});return {targetId:senseId,merged:false};}
 const others=await tx.vocabularySense.findMany({where:{...vocabularyWhere(scope),id:{not:senseId},sourceLanguage:source.sourceLanguage,lemma:source.lemma,confirmedDictionaryId:selected},orderBy:[{createdAt:'asc'},{id:'asc'}],take:100});
 const target=others.find(other=>compatible(source,other));
 if(target){await tx.vocabularySense.update({where:{id:senseId},data:{confirmedDictionaryId:selected}});return mergeIn(tx,scope,[senseId],target.id,true,protectJobId);}
 await tx.vocabularySense.update({where:{id:senseId},data:{confirmedDictionaryId:selected,senseKey:others.length?'dictionary:'+selected+':conflict:'+senseId:'dictionary:'+selected,status:others.length?'unresolved':'ready',revision:{increment:1}}});
 return {targetId:senseId,merged:false};
}
export const senseActionSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('merge'),sourceIds:z.array(z.string().min(1).max(200)).min(1).max(20),targetId:z.string().min(1).max(200)}).strict(),
 z.object({action:z.literal('split'),senseId:z.string().min(1).max(200),encounterIds:z.array(z.string().min(1).max(200)).min(1).max(100)}).strict(),
 z.object({action:z.literal('confirm'),senseId:z.string().min(1).max(200),dictionarySenseId:z.string().length(64),revision:z.number().int().nonnegative()}).strict(),
]);
export function createSenseService(db:PrismaClient,options:{candidates?:(lemma:string,language:SourceLanguage)=>Promise<DictionarySenseCandidate[]>}={}){
 const candidates=options.candidates??dictionarySenseCandidates;
 const atomic=<T>(run:(tx:Prisma.TransactionClient)=>Promise<T>)=>db.$transaction(run,{maxWait:5000,timeout:10000}).catch(error=>{if(error&&typeof error==='object'&&'code'in error&&['P2002','P2028','P2034','P1008'].includes(String(error.code)))throw new VocabularyError('义项已在其他操作中更新，请刷新重试',409);throw error;});
 const resolveSense=async(scope:LearningScope,senseId:string,result:EnrichmentResult,expectedRevision:number)=>{
  const source=await db.vocabularySense.findFirst({where:{id:senseId,...vocabularyWhere(scope)},select:{lemma:true,sourceLanguage:true}});if(!source)throw new VocabularyError('义项不存在',404);
  const offered=await candidates(source.lemma,source.sourceLanguage as SourceLanguage);return atomic(tx=>resolveSenseIn(tx,scope,senseId,result,expectedRevision,offered));
 };
 const merge=(scope:LearningScope,sourceIds:string[],targetId:string)=>atomic(tx=>mergeIn(tx,scope,sourceIds,targetId));
 const split=(scope:LearningScope,senseId:string,encounterIds:string[])=>atomic(async tx=>{
  const source=await requireSense(tx,scope,senseId);if(!encounterIds.length||encounterIds.length>100||new Set(encounterIds).size!==encounterIds.length||encounterIds.some(id=>!source.encounters.some(e=>e.id===id)))throw new VocabularyError('拆分出处不正确',400);
  const target=await tx.vocabularySense.create({data:{...scope,lemma:source.lemma,sourceLanguage:source.sourceLanguage,senseKey:'split:'+randomUUID(),priority:source.priority}});
  await tx.vocabularyEncounter.updateMany({where:{id:{in:encounterIds},senseId,...sourceWhere(scope)},data:{senseId:target.id}});
  const empty=createEmptyCard(new Date());await tx.reviewCard.create({data:{senseId:target.id,stateJson:JSON.stringify(empty),due:empty.due}});
  if(encounterIds.length===source.encounters.length)await tx.reviewCard.updateMany({where:{senseId,archivedAt:null},data:{archivedAt:new Date(),version:{increment:1}}});
  await tx.vocabularySense.update({where:{id:senseId},data:{revision:{increment:1}}});await cancelOldJobs(tx,[senseId]);await enqueueEnrichment(tx,scope,target.id,target.revision);
  await tx.senseChange.create({data:{...scope,action:'split',sourceIdsJson:JSON.stringify([senseId]),targetId:target.id,encounterIdsJson:JSON.stringify(encounterIds),detailJson:JSON.stringify({originalHistoryRetained:true,originalRevision:source.revision,manualSnapshot:{meaningEn:source.manualMeaningEn,meaningZh:source.manualMeaningZh,tagsJson:source.manualTagsJson}})}});
  return {targetId:target.id,merged:false};
 });
 const confirm=async(scope:LearningScope,senseId:string,dictionaryId:string,revision:number)=>{
  const source=await db.vocabularySense.findFirst({where:{id:senseId,...vocabularyWhere(scope)}});if(!source)throw new VocabularyError('义项不存在',404);
  // A human dictionary choice is separate from generated tags/meaning and does not overwrite them.
  const result:EnrichmentResult={lemma:source.lemma,selectedDictionarySenseId:dictionaryId,meaning:{en:source.meaningEn||'Human-confirmed contextual sense'},pos:'other',semanticCategory:'unknown',domain:null,contextTags:[],collocations:['Human-confirmed sense','Original reading context'],uncertain:false};
  const offered=await candidates(source.lemma,source.sourceLanguage as SourceLanguage);return atomic(async tx=>{const resolved=await resolveSenseIn(tx,scope,senseId,result,revision,offered);await tx.senseChange.create({data:{...scope,action:'confirm',sourceIdsJson:JSON.stringify([senseId]),targetId:resolved.targetId,encounterIdsJson:'[]',detailJson:JSON.stringify({dictionaryId,sourceRevision:revision,manualSelection:true})}});return resolved;});
 };
 const history=async(scope:LearningScope,senseId:string)=>{if(!await db.vocabularySense.findFirst({where:{id:senseId,...vocabularyWhere(scope)},select:{id:true}}))throw new VocabularyError('义项不存在',404);return db.senseChange.findMany({where:{...scope,OR:[{targetId:senseId},{sourceIdsJson:{contains:JSON.stringify(senseId)}}]},orderBy:{createdAt:'desc'},take:30});};
 return {resolveSense,merge,split,confirm,history,candidates};
}
