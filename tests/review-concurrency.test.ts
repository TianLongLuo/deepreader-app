import {afterEach,beforeEach,expect,it} from 'vitest';
import {createVocabularyDB} from './helpers/vocabulary-db';
import {createReviewService} from '@/server/review/service';
let db:Awaited<ReturnType<typeof createVocabularyDB>>;
beforeEach(async()=>{db=await createVocabularyDB();});afterEach(async()=>{await db?.close();});
async function session(revealed=true){
 const sense=await db.seedSense(),card=await db.prisma.reviewCard.findUniqueOrThrow({where:{senseId_ability:{senseId:sense.id,ability:'recognition'}}}),encounter=await db.prisma.vocabularyEncounter.findFirstOrThrow({where:{senseId:sense.id}});
 return db.prisma.reviewSession.create({data:{...db.scope,cardId:card.id,encounterId:encounter.id,cardVersion:0,senseRevision:0,definitionLanguage:'zh',expiresAt:new Date(Date.now()+600000),revealedAt:revealed?new Date():null}});
}
it('rates only one version in two simultaneous windows and records a full log once',async()=>{
 const s=await session(),service=createReviewService(db.prisma);
 const results=await Promise.allSettled(['op-a','op-b'].map(operationId=>service.rate(db.scope,{sessionId:s.id,operationId,rating:'good'})));
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
 expect(await db.prisma.reviewLog.count()).toBe(1);const card=await db.prisma.reviewCard.findUniqueOrThrow({where:{id:s.cardId}});expect(card.version).toBe(1);expect(JSON.parse(card.stateJson).reps).toBe(1);
 const log=await db.prisma.reviewLog.findFirstOrThrow();expect(JSON.parse(log.beforeJson).reps).toBe(0);expect(JSON.parse(log.logJson).rating).toBe(3);
});
it('replays the same operation without re-rating and rejects payload changes or another session',async()=>{
 const s=await session(),service=createReviewService(db.prisma),input={sessionId:s.id,operationId:'operation',rating:'good' as const};
 const first=await service.rate(db.scope,input);expect(await service.rate(db.scope,input)).toEqual(first);
 await expect(service.rate(db.scope,{...input,rating:'again'})).rejects.toMatchObject({status:409});
 const other=await session();await expect(service.rate(db.scope,{...input,sessionId:other.id})).rejects.toMatchObject({status:409});expect(await db.prisma.reviewLog.count()).toBe(1);
});
it('rejects unrevealed, expired, revised, deleted and foreign scope sessions without changing card',async()=>{
 const s=await session(false),service=createReviewService(db.prisma),input={sessionId:s.id,operationId:'op',rating:'again' as const};
 await expect(service.rate(db.scope,input)).rejects.toMatchObject({status:409});
 await db.prisma.reviewSession.update({where:{id:s.id},data:{revealedAt:new Date(),expiresAt:new Date(0)}});await expect(service.rate(db.scope,input)).rejects.toMatchObject({status:409});
 await db.prisma.reviewSession.update({where:{id:s.id},data:{expiresAt:new Date(Date.now()+60000)}});
 await expect(service.rate({...db.scope,userId:'other-user'},input)).rejects.toMatchObject({status:404});
 await db.prisma.vocabularySense.updateMany({data:{revision:1}});await expect(service.rate(db.scope,input)).rejects.toMatchObject({status:409});
 await db.prisma.vocabularySense.updateMany({data:{revision:0}});await db.prisma.document.update({where:{id:db.document.id},data:{status:'DELETED'}});await expect(service.rate(db.scope,input)).rejects.toMatchObject({status:404});expect(await db.prisma.reviewLog.count()).toBe(0);
});
it('concurrent retries with one operation ID never create duplicate grades',async()=>{
 const s=await session(),service=createReviewService(db.prisma),input={sessionId:s.id,operationId:'same-operation',rating:'good' as const};
 const a=await Promise.allSettled([service.rate(db.scope,input),service.rate(db.scope,input)]);
 const replay=await service.rate(db.scope,input);
 expect(a.filter(x=>x.status==='fulfilled').map(x=>x.value)).toContainEqual(replay);
 expect(await db.prisma.reviewLog.count()).toBe(1);expect((await db.prisma.reviewCard.findUniqueOrThrow({where:{id:s.cardId}})).version).toBe(1);
});
it('merging legacy sources chooses a context that actually supplies the hidden answer',async()=>{
 const {createSenseService}=await import('@/server/vocabulary/senses');const old=await db.seedSense({meaningEn:'',meaningZh:''}),pending=await db.seedSense({meaningEn:'',meaningZh:''});
 await db.prisma.vocabularyEncounter.updateMany({where:{senseId:old.id},data:{legacyContextMeaning:'眯起眼睛看',targetSentence:'An older answerable sentence.',createdAt:new Date('2020-01-01')}});
 await db.prisma.vocabularyEncounter.updateMany({where:{senseId:pending.id},data:{legacyContextMeaning:'',targetSentence:'A newer pending sentence.',createdAt:new Date('2026-10-01')}});
 await createSenseService(db.prisma).merge(db.scope,[pending.id],old.id);const service=createReviewService(db.prisma),front=await service.front(db.scope,'zh');
 expect(front?.sentence).toBe('An older answerable sentence.');expect((await service.reveal(db.scope,front!.sessionId)).meaning).toBe('眯起眼睛看');
 expect((await service.summary(db.scope)).dueCount).toBe(1);
});
