import {afterEach,beforeEach,expect,it} from 'vitest';
import {createVocabularyDB} from './helpers/vocabulary-db';
import {createSenseService,dictionarySenseId,type DictionarySenseCandidate} from '@/server/vocabulary/senses';
import {createReviewService} from '@/server/review/service';
import {createVocabularyService} from '@/server/vocabulary/service';
import type {EnrichmentResult} from '@/lib/vocabulary-taxonomy';
const candidate=(lemma:string,definition:string):DictionarySenseCandidate=>({id:dictionarySenseId('test-1',lemma,'noun',definition),lemma,pos:'noun',definition,datasetVersion:'test-1'});
const marketing=candidate('conversion','A marketing conversion'),calculation=candidate('conversion','A numeric conversion');
const result=(id:string|null,uncertain=false):EnrichmentResult=>({lemma:'conversion',selectedDictionarySenseId:id,meaning:{en:'A customer takes the desired action.',zh:'转化'},pos:'noun',semanticCategory:'event',domain:'work.marketing.conversion',contextTags:['office'],collocations:['conversion rate','track conversions'],uncertain});
let db:Awaited<ReturnType<typeof createVocabularyDB>>;
beforeEach(async()=>{db=await createVocabularyDB();});afterEach(async()=>{await db?.close();});
const service=()=>createSenseService(db.prisma,{candidates:async()=>[marketing,calculation]});
it('fingerprints all source identity fields with NFC while preserving Spanish accents',()=>{
 expect(dictionarySenseId('v','cafe\u0301','noun','Drink')).toBe(dictionarySenseId('v','café','noun','Drink'));
 expect(dictionarySenseId('v','café','noun','Drink')).not.toBe(dictionarySenseId('v','cafe','noun','Drink'));
 expect(dictionarySenseId('v2','café','noun','Drink')).not.toBe(dictionarySenseId('v','café','noun','Drink'));
});
it('keeps different confirmed meanings, unresolved same spellings and cross-language homographs separate',async()=>{
 const a=await db.seedSense({lemma:'conversion'}),b=await db.seedSense({lemma:'conversion'}),c=await db.seedSense({lemma:'conversion'}),es=await db.seedSense({lemma:'conversion',sourceLanguage:'es'});
 await service().resolveSense(db.scope,a.id,result(marketing.id),a.revision);await service().resolveSense(db.scope,b.id,result(calculation.id),b.revision);await service().resolveSense(db.scope,c.id,result(null,true),c.revision);await service().resolveSense(db.scope,es.id,result(marketing.id),es.revision);
 expect(await db.prisma.vocabularySense.count({where:{status:{not:'merged'}}})).toBe(4);expect(await db.prisma.reviewCard.count({where:{archivedAt:null}})).toBe(4);
});
it('merges confirmed same meanings into one active card, preserving original logged cards and raw encounters',async()=>{
 const a=await db.seedSense({lemma:'conversion'}),b=await db.seedSense({lemma:'conversion'});
 const review=createReviewService(db.prisma),front=(await review.front(db.scope,'zh'))!;await review.reveal(db.scope,front.sessionId);await review.rate(db.scope,{sessionId:front.sessionId,operationId:'history',rating:'good'});
 const originals=await db.prisma.readingEntry.findMany({orderBy:{id:'asc'}}),log=await db.prisma.reviewLog.findFirstOrThrow();
 await service().resolveSense(db.scope,a.id,result(marketing.id),a.revision);const resolved=await service().resolveSense(db.scope,b.id,result(marketing.id),b.revision);expect(resolved.targetId).toBe(a.id);
 expect(await db.prisma.vocabularyEncounter.count({where:{senseId:a.id}})).toBe(2);expect(await db.prisma.reviewCard.count({where:{archivedAt:null}})).toBe(1);expect(await db.prisma.reviewLog.findUnique({where:{id:log.id}})).toEqual(log);expect(await db.prisma.readingEntry.findMany({orderBy:{id:'asc'}})).toEqual(originals);expect(await db.prisma.senseChange.count()).toBe(1);
 await expect(review.reveal(db.scope,front.sessionId)).rejects.toMatchObject({status:409});
});
it('keeps incompatible manual corrections separate and rejects stale or forged dictionary selections',async()=>{
 const a=await db.seedSense({lemma:'conversion',manualMeaningZh:'人工甲'}),b=await db.seedSense({lemma:'conversion',manualMeaningZh:'人工乙'});
 await service().resolveSense(db.scope,a.id,result(marketing.id),a.revision);await service().resolveSense(db.scope,b.id,result(marketing.id),b.revision);expect(await db.prisma.reviewCard.count({where:{archivedAt:null}})).toBe(2);expect((await db.prisma.vocabularySense.findUniqueOrThrow({where:{id:b.id}})).status).toBe('unresolved');
 const c=await db.seedSense({lemma:'conversion'});await createVocabularyService(db.prisma).edit(db.scope,c.id,{revision:c.revision,manualMeaning:{zh:'人工新释义'}});
 await expect(service().resolveSense(db.scope,c.id,result(marketing.id),c.revision)).rejects.toMatchObject({status:409});
 await expect(service().resolveSense(db.scope,c.id,result('forged-id'),c.revision+1)).rejects.toMatchObject({status:400});
});
it('explicit merge and split preserve learning history, create one fresh split card, and scope every encounter',async()=>{
 const a=await db.seedSense({lemma:'conversion'}),b=await db.seedSense({lemma:'conversion'});const review=createReviewService(db.prisma),front=(await review.front(db.scope,'zh'))!;await review.reveal(db.scope,front.sessionId);await review.rate(db.scope,{sessionId:front.sessionId,operationId:'manual-history',rating:'again'});
 await service().merge(db.scope,[b.id],a.id);const encounters=await db.prisma.vocabularyEncounter.findMany({where:{senseId:a.id}}),logs=await db.prisma.reviewLog.findMany();
 await expect(service().split({userId:'other-user',workspaceId:'other-workspace'},a.id,[encounters[0].id])).rejects.toMatchObject({status:404});
 const split=await service().split(db.scope,a.id,[encounters[0].id]);const card=await db.prisma.reviewCard.findFirstOrThrow({where:{senseId:split.targetId}});expect(JSON.parse(card.stateJson).reps).toBe(0);expect(await db.prisma.reviewLog.findMany()).toEqual(logs);expect(await db.prisma.senseChange.count()).toBe(2);
 expect(await db.prisma.vocabularyEncounter.count()).toBe(2);expect(await db.prisma.reviewCard.count({where:{archivedAt:null}})).toBe(2);
 const fresh=await db.seedSense({lemma:'different'});await expect(service().merge(db.scope,[fresh.id],a.id)).rejects.toMatchObject({status:400});
});
it('fails merge atomically if a linked entry belongs to another user',async()=>{
 const a=await db.seedSense({lemma:'conversion'}),b=await db.seedSense({lemma:'conversion'});const encounter=await db.prisma.vocabularyEncounter.findFirstOrThrow({where:{senseId:b.id}});
 await db.prisma.readingEntry.update({where:{id:encounter.readingEntryId},data:{userId:'other-user'}});
 await expect(service().merge(db.scope,[b.id],a.id)).rejects.toMatchObject({status:409});expect(await db.prisma.senseChange.count()).toBe(0);expect((await db.prisma.vocabularyEncounter.findUniqueOrThrow({where:{id:encounter.id}})).senseId).toBe(b.id);
});
it('releases dictionary uniqueness after a sense becomes uncertain or is archived by explicit merge',async()=>{
 const a=await db.seedSense({lemma:'conversion'});await service().resolveSense(db.scope,a.id,result(marketing.id),0);await service().resolveSense(db.scope,a.id,result(null,true),1);
 const b=await db.seedSense({lemma:'conversion'});await service().resolveSense(db.scope,b.id,result(marketing.id),0);
 const c=await db.seedSense({lemma:'conversion'});await service().resolveSense(db.scope,c.id,result(calculation.id),0);await service().merge(db.scope,[c.id],b.id);
 const d=await db.seedSense({lemma:'conversion'});await service().resolveSense(db.scope,d.id,result(calculation.id),0);
 expect((await db.prisma.vocabularySense.findUniqueOrThrow({where:{id:d.id}})).confirmedDictionaryId).toBe(calculation.id);
});
it('records manual dictionary confirmation and rejects cross-workspace choice/history access',async()=>{
 const a=await db.seedSense({lemma:'conversion'});await service().confirm(db.scope,a.id,marketing.id,0);expect(await db.prisma.senseChange.count({where:{action:'confirm'}})).toBe(1);
 await expect(service().confirm({userId:'other-user',workspaceId:'other-workspace'},a.id,marketing.id,1)).rejects.toMatchObject({status:404});
 await expect(service().history({userId:'other-user',workspaceId:'other-workspace'},a.id)).rejects.toMatchObject({status:404});expect((await service().history(db.scope,a.id))[0].action).toBe('confirm');
});
it('retries a concurrent confirmation conflict without duplicating active cards or dropping encounters',async()=>{
 const a=await db.seedSense({lemma:'conversion'}),b=await db.seedSense({lemma:'conversion'});
 const outcomes=await Promise.allSettled([service().resolveSense(db.scope,a.id,result(marketing.id),0),service().resolveSense(db.scope,b.id,result(marketing.id),0)]);
 for(let i=0;i<outcomes.length;i++){const outcome=outcomes[i];if(outcome.status==='rejected'){expect(outcome.reason.status).toBe(409);const sense=await db.prisma.vocabularySense.findUniqueOrThrow({where:{id:[a.id,b.id][i]}});await service().resolveSense(db.scope,sense.id,result(marketing.id),sense.revision);}}
 expect(await db.prisma.vocabularyEncounter.count()).toBe(2);expect(await db.prisma.reviewCard.count({where:{archivedAt:null}})).toBe(1);
});
