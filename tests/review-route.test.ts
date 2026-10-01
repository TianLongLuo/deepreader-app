import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createVocabularyDB} from './helpers/vocabulary-db';
import {createReviewService} from '@/server/review/service';
const auth=vi.hoisted(()=>({requireAuth:vi.fn()}));vi.mock('@/lib/auth',()=>auth);
import {GET} from '@/app/api/study/review/route';
import {POST as revealRoute} from '@/app/api/study/review/reveal/route';
let db:Awaited<ReturnType<typeof createVocabularyDB>>;
beforeEach(async()=>{db=await createVocabularyDB();});afterEach(async()=>{await db?.close();vi.clearAllMocks();});
it('front contains only question data, no answer or dictionary fields; reveal is server recorded',async()=>{
 await db.seedSense();const service=createReviewService(db.prisma),front=await service.front(db.scope,'zh');expect(front).not.toBeNull();
 expect(Object.keys(front!).sort()).toEqual(['cardId','remaining','sentence','sessionId','sourceLanguage','version','word'].sort());expect(JSON.stringify(front)).not.toContain('眯起眼睛');
 await expect(service.rate(db.scope,{sessionId:front!.sessionId,operationId:'op',rating:'good'})).rejects.toMatchObject({status:409});
 const back=await service.reveal(db.scope,front!.sessionId);expect(back.meaning).toBe('眯起眼睛看');expect((await db.prisma.reviewSession.findUniqueOrThrow({where:{id:front!.sessionId}})).revealedAt).not.toBeNull();
 await service.rate(db.scope,{sessionId:front!.sessionId,operationId:'op',rating:'good'});await expect(service.reveal(db.scope,front!.sessionId)).rejects.toMatchObject({status:409});
});
it('does not reveal another user session or an expired/revised/deleted source',async()=>{
 const sense=await db.seedSense(),service=createReviewService(db.prisma),front=(await service.front(db.scope,'zh'))!;
 await expect(service.reveal({...db.scope,userId:'other-user'},front.sessionId)).rejects.toMatchObject({status:404});
 await db.prisma.reviewSession.update({where:{id:front.sessionId},data:{expiresAt:new Date(0)}});await expect(service.reveal(db.scope,front.sessionId)).rejects.toMatchObject({status:409});
 await db.prisma.reviewSession.update({where:{id:front.sessionId},data:{expiresAt:new Date(Date.now()+600000)}});
 await db.prisma.vocabularySense.update({where:{id:sense.id},data:{revision:1}});await expect(service.reveal(db.scope,front.sessionId)).rejects.toMatchObject({status:409});
 await db.prisma.vocabularySense.update({where:{id:sense.id},data:{revision:0}});await db.prisma.document.update({where:{id:db.document.id},data:{status:'DELETED'}});await expect(service.reveal(db.scope,front.sessionId)).rejects.toMatchObject({status:404});expect(await service.front(db.scope,'zh')).toBeNull();
});
it('returns null and a next-due summary, respects source language, and marks definition fallback',async()=>{
 await db.seedSense({meaningZh:'',meaningEn:'narrow your eyes',sourceLanguage:'es'});const service=createReviewService(db.prisma);
 expect(await service.front(db.scope,'zh','en')).toBeNull();const front=(await service.front(db.scope,'zh','es'))!;
 expect(await service.reveal(db.scope,front.sessionId)).toMatchObject({meaning:'narrow your eyes',definitionLanguage:'en',fallback:true});
 const due=new Date(Date.now()+86400000);await db.prisma.reviewCard.update({where:{id:front.cardId},data:{due}});
 expect(await service.front(db.scope,'zh')).toBeNull();expect(await service.summary(db.scope)).toMatchObject({dueCount:0,nextDue:due.toISOString()});
});
it('selects a surviving encounter when one source document is deleted',async()=>{
 const sense=await db.seedSense(),old=await db.prisma.vocabularyEncounter.findFirstOrThrow();const document=await db.prisma.document.create({data:{...db.document,id:'second-document',title:'Second book'}});
 const word=await db.seedWord({documentId:document.id,text:'squint',location:'second'});await db.prisma.vocabularyEncounter.create({data:{...old,id:'second-encounter',readingEntryId:word.id,documentId:document.id,targetSentence:'I squint in sunlight.'}});
 await db.prisma.document.update({where:{id:db.document.id},data:{status:'DELETED'}});const front=await createReviewService(db.prisma).front(db.scope,'zh');expect(front?.sentence).toBe('I squint in sunlight.');expect(front?.word).toBe(sense.lemma);
});
it('HTTP routes reject unauthenticated, cross-origin and injected reveal requests with private responses',async()=>{
 auth.requireAuth.mockRejectedValue(new Error('Authentication required'));expect((await GET(new Request('http://reader.test/api/study/review'))).status).toBe(401);
 auth.requireAuth.mockResolvedValue({id:'test-user',workspaceId:'test-workspace'});
 const response=await revealRoute(new Request('http://reader.test/api/study/review/reveal',{method:'POST',headers:{origin:'http://evil.test',host:'reader.test','sec-fetch-site':'cross-site'},body:'{"sessionId":"x"}'}));expect(response.status).toBe(403);expect(response.headers.get('Cache-Control')).toContain('no-store');
 expect((await revealRoute(new Request('http://reader.test/api/study/review/reveal',{method:'POST',body:'{"sessionId":"x","due":"tomorrow"}'}))).status).toBe(400);
});
