import {randomUUID} from 'node:crypto';
import type {EnrichmentJob,PrismaClient,Prisma} from '@prisma/client';
import {AIStreamError,type AIStreamEvent} from '@/lib/ai-stream';
import {enrichmentResultSchema,type EnrichmentResult} from '@/lib/vocabulary-taxonomy';
import {awaitWithSignal,abortableDelay} from '@/server/reading-assistant/cancellation';
import {lookupFrequency} from './frequency';
import {dictionarySenseCandidates,resolveSenseIn} from './senses';
import {VocabularyError} from './scope';
import {vocabularyWhere} from './query';
import {createVocabularyService} from './service';
import {enqueueEnrichment} from './enqueue';
import type {LearningScope} from './types';
export {enqueueEnrichment} from './enqueue';
export type JobProgress={draft:string;stage:'waiting'|'generating'|'validating'|'complete'};
export type JobPublic={id:string;status:string;attempts:number;expectedRevision:number;errorCode:string|null;eventVersion:number;targetSenseId:string|null;progress:JobProgress};
const retryDelays=[30000,120000,600000];
const jobScope=(job:EnrichmentJob):LearningScope=>({userId:job.userId,workspaceId:job.workspaceId});
const jobWhere=(job:EnrichmentJob,now=new Date())=>({id:job.id,userId:job.userId,workspaceId:job.workspaceId,status:'running',leaseToken:job.leaseToken,leaseUntil:{gt:now}});
function transient(error:unknown){return !!error&&typeof error==='object'&&'code'in error&&['P2028','P2034','P1008'].includes(String(error.code));}
/** Global single active job across workers; a fenced expired lease may be recovered. */
export async function claimJob(db:PrismaClient,now:Date):Promise<EnrichmentJob|null>{
 try{return await db.$transaction(async tx=>{
  await tx.enrichmentJob.updateMany({where:{status:'running',leaseUntil:{lte:now},attempts:{gte:4}},data:{status:'failed',errorCode:'LEASE_EXPIRED',leaseUntil:null,leaseToken:null,eventVersion:{increment:1}}});
  if(await tx.enrichmentJob.findFirst({where:{status:'running',leaseUntil:{gt:now}},select:{id:true}}))return null;
  const candidate=await tx.enrichmentJob.findFirst({where:{attempts:{lt:4},OR:[{status:'queued',availableAt:{lte:now}},{status:'running',leaseUntil:{lte:now}}]},orderBy:[{availableAt:'asc'},{id:'asc'}]});
  if(!candidate)return null;
  const leaseToken=randomUUID(),leaseUntil=new Date(now.getTime()+120000);
  const changed=await tx.enrichmentJob.updateMany({where:{id:candidate.id,eventVersion:candidate.eventVersion,status:candidate.status,leaseToken:candidate.leaseToken},data:{status:'running',attempts:{increment:1},leaseToken,leaseUntil,errorCode:null,progressJson:JSON.stringify({draft:'',stage:'generating'}),eventVersion:{increment:1}}});
  return changed.count===1?tx.enrichmentJob.findUniqueOrThrow({where:{id:candidate.id}}):null;
 },{maxWait:1000,timeout:5000});}catch(error){if(transient(error))return null;throw error;}
}
export function createEnrichmentJobs(db:PrismaClient,options:{generate?:(job:EnrichmentJob,signal:AbortSignal,progress:(value:JobProgress)=>Promise<void>)=>Promise<EnrichmentResult>}={}){
 const lastProgress=new Map<string,number>();
 const progress=async(job:EnrichmentJob,value:JobProgress,now=new Date())=>{
  const safe={draft:value.draft.slice(0,4000),stage:value.stage},key=job.leaseToken||job.id;
  if(now.getTime()-(lastProgress.get(key)??0)<250)return;
  const updated=await db.enrichmentJob.updateMany({where:jobWhere(job,now),data:{progressJson:JSON.stringify(safe),eventVersion:{increment:1}}});
  if(updated.count!==1)throw new VocabularyError('整理任务已更新',409);
  lastProgress.set(key,now.getTime());
 };
 const status=async(scope:LearningScope,senseId:string):Promise<JobPublic>=>{
  const sense=await db.vocabularySense.findFirst({where:{id:senseId,...scope,status:{not:'deleted'}},select:{id:true,status:true}});if(!sense)throw new VocabularyError('词条不存在',404);
  const job=await db.enrichmentJob.findFirst({where:{...scope,senseId},orderBy:[{expectedRevision:'desc'},{createdAt:'desc'}]});if(!job)throw new VocabularyError('没有整理任务',404);
  if(sense.status==='merged'){if(!job.targetSenseId||!await db.vocabularySense.findFirst({where:{id:job.targetSenseId,...vocabularyWhere(scope)},select:{id:true}}))throw new VocabularyError('词条不存在',404);}else if(!await db.vocabularySense.findFirst({where:{id:senseId,...vocabularyWhere(scope)},select:{id:true}}))throw new VocabularyError('词条不存在',404);
  let value:JobProgress={draft:'',stage:'waiting'};try{const parsed=JSON.parse(job.progressJson);if(typeof parsed.draft==='string'&&['waiting','generating','validating','complete'].includes(parsed.stage))value={draft:parsed.draft.slice(0,4000),stage:parsed.stage};}catch{}
  return {id:job.id,status:job.status,attempts:job.attempts,expectedRevision:job.expectedRevision,errorCode:job.errorCode,eventVersion:job.eventVersion,targetSenseId:job.targetSenseId,progress:value};
 };
 const retry=async(scope:LearningScope,senseId:string)=>db.$transaction(async tx=>{
  const sense=await tx.vocabularySense.findFirst({where:{id:senseId,...vocabularyWhere(scope)},select:{id:true,revision:true}});if(!sense)throw new VocabularyError('词条不存在',404);
  const job=await tx.enrichmentJob.findUnique({where:{senseId_expectedRevision:{senseId,expectedRevision:sense.revision}}});
  if(job&&['running','queued'].includes(job.status))return job;
  if(job?.status==='complete')throw new VocabularyError('此修订已整理完成',409);
  if(job){await tx.enrichmentJob.update({where:{id:job.id},data:{status:'queued',attempts:0,availableAt:new Date(),leaseUntil:null,leaseToken:null,errorCode:null,progressJson:'{}',eventVersion:{increment:1}}});}
  else await enqueueEnrichment(tx,scope,senseId,sense.revision);
  return tx.enrichmentJob.findUniqueOrThrow({where:{senseId_expectedRevision:{senseId,expectedRevision:sense.revision}}});
 });
 const runJob=async(job:EnrichmentJob,parent:AbortSignal)=>{
  const timeout=AbortSignal.timeout(90000),signal=AbortSignal.any([parent,timeout]);
  try{
   const sense=await db.vocabularySense.findFirst({where:{id:job.senseId,...vocabularyWhere(jobScope(job))},select:{revision:true,lemma:true,sourceLanguage:true}});
   if(!sense)throw new VocabularyError('词条不存在',404);if(sense.revision!==job.expectedRevision)throw new VocabularyError('修订冲突',409);
   const frequency=await lookupFrequency([{lemma:sense.lemma,language:sense.sourceLanguage as 'en'|'es'}],signal).catch(error=>{if(signal.aborted)throw error;return null;});
   if(frequency?.[0])await db.vocabularySense.updateMany({where:{id:job.senseId,...jobScope(job),revision:job.expectedRevision},data:{frequencyZipf:frequency[0].zipf,frequencyVersion:frequency[0].version,frequencySource:frequency[0].source,frequencyCheckedAt:new Date()}});
   const generate=options.generate??(await import('./enrichment')).createEnrichmentGenerator(db);
   const result=enrichmentResultSchema.parse(await awaitWithSignal(generate(job,signal,value=>progress(job,value)),signal));signal.throwIfAborted();
   const offered=result.selectedDictionarySenseId?await dictionarySenseCandidates(result.lemma,(await db.vocabularySense.findUniqueOrThrow({where:{id:job.senseId},select:{sourceLanguage:true}})).sourceLanguage as 'en'|'es',signal):[];
   await db.$transaction(async tx=>{
    if(!await tx.enrichmentJob.findFirst({where:jobWhere(job)}))throw new VocabularyError('整理任务已更新',409);
    const service=createVocabularyService(tx as unknown as PrismaClient,{authorizeSuggestion:async(scope,id,revision)=>!!await tx.enrichmentJob.findFirst({where:{...jobWhere(job),...scope,senseId:id,expectedRevision:revision}})});
    await service.applySuggestion(jobScope(job),job.senseId,job.expectedRevision,{lemma:result.lemma,meaningEn:result.meaning.en||'',meaningZh:result.meaning.zh||'',pos:result.pos,semanticCategory:result.semanticCategory,domain:result.domain,tagsJson:JSON.stringify(result.contextTags),collocationsJson:JSON.stringify(result.collocations),status:result.uncertain||!result.selectedDictionarySenseId?'unresolved':'ready'});
    const resolved=await resolveSenseIn(tx,jobScope(job),job.senseId,result,job.expectedRevision+1,offered,job.id);
    if(frequency?.[0]&&resolved.targetId!==job.senseId)await tx.vocabularySense.update({where:{id:resolved.targetId},data:{frequencyZipf:frequency[0].zipf,frequencyVersion:frequency[0].version,frequencySource:frequency[0].source,frequencyCheckedAt:new Date()}});
    await tx.enrichmentJob.update({where:{id:job.id},data:{targetSenseId:resolved.targetId,status:'complete',leaseUntil:null,leaseToken:null,errorCode:null,progressJson:JSON.stringify({draft:result.meaning.zh||result.meaning.en||'',stage:'complete'}),eventVersion:{increment:1}}});
   });
  }catch(error){
   if(parent.aborted){await db.enrichmentJob.updateMany({where:jobWhere(job),data:{status:'queued',availableAt:new Date(),attempts:{decrement:1},leaseUntil:null,leaseToken:null,progressJson:'{}',eventVersion:{increment:1}}});return;}
   const code=error instanceof VocabularyError?(error.status===409?'REVISION_CONFLICT':'SOURCE_UNAVAILABLE'):timeout.aborted?'TIMEOUT':error instanceof AIStreamError?(['UNAVAILABLE','STREAM_UNSUPPORTED','INVALID_OUTPUT','TOO_LARGE'].includes(error.code)?error.code:'FAILED'):'FAILED';
   const retryable=!['REVISION_CONFLICT','SOURCE_UNAVAILABLE','UNAVAILABLE','STREAM_UNSUPPORTED'].includes(code)&&job.attempts<=3;
   await db.enrichmentJob.updateMany({where:jobWhere(job),data:{status:retryable?'queued':'failed',availableAt:new Date(Date.now()+(retryDelays[job.attempts-1]??0)),errorCode:code,leaseUntil:null,leaseToken:null,progressJson:'{}',eventVersion:{increment:1}}});
  }finally{lastProgress.delete(job.leaseToken||job.id);}
 };
 async function* subscribe(scope:LearningScope,senseId:string,signal:AbortSignal):AsyncIterable<AIStreamEvent<JobPublic>>{
  const requestId=randomUUID();yield {requestId,type:'start',cached:false};let version=-1,displayed='',jobId='';const deadline=Date.now()+150000;
  for(;;){
   signal.throwIfAborted();const value=await status(scope,senseId);
   if(value.eventVersion!==version||value.id!==jobId){
    if(value.progress.draft.startsWith(displayed)){const delta=value.progress.draft.slice(displayed.length);if(delta)yield {requestId,type:'delta',text:delta};}
    displayed=value.progress.draft;version=value.eventVersion;jobId=value.id;yield {requestId,type:'unit',index:version,value};
   }
   if(value.status==='complete'){yield {requestId,type:'complete',value};return;}
   if(value.status==='failed'){yield {requestId,type:'error',code:'FAILED',message:'整理未完成，请重试'};return;}
   if(Date.now()>=deadline)throw new AIStreamError('TIMEOUT','');
   await abortableDelay(500,signal);
  }
 }
 return {progress,status,retry,runJob,subscribe};
}
