import type {PrismaClient,Prisma} from '@prisma/client';
import {z} from 'zod';
import {prisma} from '@/lib/prisma';
import {activeDocument,VocabularyError} from '@/server/vocabulary/service';
import type {LearningScope,MeaningLanguage,SourceLanguage,ReviewFront} from '@/server/vocabulary/types';
import {contextualMeaning} from '@/server/vocabulary/meaning';
import {decodeReviewCard,scheduleReview} from './scheduler';
import {answerableEncounterWhere,reviewableSenseWhere} from './eligibility';
export class ReviewError extends VocabularyError{}
export const rateSchema=z.object({sessionId:z.string().min(1).max(200),operationId:z.string().min(1).max(128),rating:z.enum(['again','good'])}).strict();
export function createReviewService(database:PrismaClient){
 const rate=async(scope:LearningScope,input:unknown)=>{
  const data=rateSchema.parse(input);
  try{return await database.$transaction(async(tx:Prisma.TransactionClient)=>{
   const existing=await tx.reviewLog.findUnique({where:{userId_workspaceId_operationId:{...scope,operationId:data.operationId}}});
   if(existing){
    if(existing.sessionId!==data.sessionId||existing.rating!==data.rating)throw new ReviewError('评分操作冲突',409);
    const after=JSON.parse(existing.afterJson);return {cardId:existing.cardId,due:after.due as string,version:after.version as number};
   }
   const session=await tx.reviewSession.findFirst({where:{id:data.sessionId,...scope,card:{sense:{...scope}},encounter:{...scope,document:{workspaceId:scope.workspaceId,...activeDocument}}},include:{card:{include:{sense:{select:{revision:true}}}}}});
   if(!session)throw new ReviewError('复习卡不存在',404);
   const now=new Date();
   if(session.card.archivedAt||session.expiresAt<=now||!session.revealedAt||session.cardVersion!==session.card.version||session.senseRevision!==session.card.sense.revision)throw new ReviewError('请翻面或重新获取复习卡',409);
   const before=decodeReviewCard(session.card.stateJson),scheduled=scheduleReview(before,data.rating,now),version=session.cardVersion+1;
   const updated=await tx.reviewCard.updateMany({where:{id:session.cardId,version:session.cardVersion},data:{stateJson:JSON.stringify(scheduled.card),due:scheduled.card.due,version}});
   if(updated.count!==1)throw new ReviewError('该卡已在其他窗口评分',409);
   await tx.reviewLog.create({data:{...scope,cardId:session.cardId,sessionId:session.id,operationId:data.operationId,rating:data.rating,reviewedAt:now,beforeJson:JSON.stringify(before),afterJson:JSON.stringify({...scheduled.card,version}),logJson:JSON.stringify(scheduled.log)}});
   return {cardId:session.cardId,due:scheduled.card.due.toISOString(),version};
  },{maxWait:10000,timeout:10000});}
  catch(error){
   // A duplicate operation can race at the unique constraint; only replay identical payloads.
   if(typeof error==='object'&&error&&'code' in error&&['P2002','P2034','P2028'].includes(String(error.code))){
    const existing=await database.reviewLog.findUnique({where:{userId_workspaceId_operationId:{...scope,operationId:data.operationId}}});
    if(existing&&existing.sessionId===data.sessionId&&existing.rating===data.rating){const after=JSON.parse(existing.afterJson);return{cardId:existing.cardId,due:after.due as string,version:after.version as number};}
    throw new ReviewError('该卡已在其他窗口评分，请刷新',409);
   }
   throw error;
  }
 };
 const encounterWhere=(scope:LearningScope)=>({...scope,document:{workspaceId:scope.workspaceId,...activeDocument}});
 const cardWhere=(scope:LearningScope,sourceLanguage?:SourceLanguage):Prisma.ReviewCardWhereInput=>({ability:'recognition',archivedAt:null,sense:{...reviewableSenseWhere(scope),...(sourceLanguage?{sourceLanguage}:{})}});
 const front=async(scope:LearningScope,definitionLanguage:MeaningLanguage,sourceLanguage?:SourceLanguage):Promise<ReviewFront|null>=>database.$transaction(async tx=>{
  const now=new Date(),where={...cardWhere(scope,sourceLanguage),due:{lte:now}};
  const card=await tx.reviewCard.findFirst({
   where, orderBy:[{due:'asc'},{id:'asc'}],
   select:{id:true,version:true,sense:{select:{
    lemma:true,sourceLanguage:true,revision:true,
    encounters:{where:answerableEncounterWhere(scope),orderBy:[{createdAt:'desc'},{id:'asc'}],take:1,
     select:{id:true,surface:true,targetSentence:true}}
   }}}
  });
  if(!card||!card.sense.encounters[0])return null;
  const encounter=card.sense.encounters[0],session=await tx.reviewSession.create({data:{...scope,cardId:card.id,encounterId:encounter.id,cardVersion:card.version,senseRevision:card.sense.revision,definitionLanguage,expiresAt:new Date(now.getTime()+30*60000)}});
  return {sessionId:session.id,cardId:card.id,version:card.version,word:encounter.surface||card.sense.lemma,sentence:encounter.targetSentence||encounter.surface,sourceLanguage:card.sense.sourceLanguage as SourceLanguage,remaining:await tx.reviewCard.count({where})};
 });
 const reveal=async(scope:LearningScope,sessionId:string)=>database.$transaction(async tx=>{
  const session=await tx.reviewSession.findFirst({where:{id:sessionId,...scope,card:{sense:{...scope}},encounter:{...encounterWhere(scope)}},select:{id:true,expiresAt:true,revealedAt:true,cardVersion:true,senseRevision:true,definitionLanguage:true,encounter:{select:{senseId:true,legacyContextMeaning:true}},card:{select:{id:true,senseId:true,archivedAt:true,version:true,sense:{select:{revision:true,meaningEn:true,meaningZh:true,manualMeaningEn:true,manualMeaningZh:true,collocationsJson:true}}}}}});
  if(!session)throw new ReviewError('复习卡不存在',404);if(session.encounter.senseId!==session.card.senseId)throw new ReviewError('义项已调整，请重新获取复习卡',409);
  const now=new Date();if(session.card.archivedAt||session.expiresAt<=now||session.card.version!==session.cardVersion||session.card.sense.revision!==session.senseRevision)throw new ReviewError('复习卡已过期，请重新获取',409);
  const value=contextualMeaning(session.card.sense,session.encounter.legacyContextMeaning,session.definitionLanguage as MeaningLanguage);
  if(!value.meaning)throw new ReviewError('请先补充语境释义',409);
  let collocation:string|null=null;try{const items:unknown=JSON.parse(session.card.sense.collocationsJson);if(Array.isArray(items))collocation=items.find(item=>typeof item==='string'&&item.trim())??null;}catch{}
  if(!session.revealedAt)await tx.reviewSession.update({where:{id:session.id},data:{revealedAt:now}});
  return {...value,collocation};
 });
 const summary=async(scope:LearningScope,sourceLanguage?:SourceLanguage)=>{
  const where=cardWhere(scope,sourceLanguage),now=new Date();
  const [dueCount,next]=await Promise.all([database.reviewCard.count({where:{...where,due:{lte:now}}}),database.reviewCard.findFirst({where:{...where,due:{gt:now}},orderBy:{due:'asc'},select:{due:true}})]);
  return {dueCount,nextDue:next?.due.toISOString()??null};
 };
 return {rate,front,reveal,summary};
}
export const reviewService=createReviewService(prisma);
