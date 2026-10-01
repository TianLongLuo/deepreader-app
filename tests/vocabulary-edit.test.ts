import {afterEach,beforeEach,expect,it} from 'vitest';
import {createVocabularyDB} from './helpers/vocabulary-db';
import {createVocabularyService} from '@/server/vocabulary/service';
let db:Awaited<ReturnType<typeof createVocabularyDB>>;
beforeEach(async()=>{db=await createVocabularyDB();});afterEach(async()=>{await db?.close();});
it('keeps manual meaning/tags authoritative and rejects old generated revisions',async()=>{
 const sense=await db.seedSense({meaningZh:'斜视'}),service=createVocabularyService(db.prisma,{authorizeSuggestion:async()=>true});
 await service.edit(db.scope,sense.id,{revision:0,manualMeaning:{zh:'眯起眼睛看'},manualTags:['daily.body.visual'],priority:2});
 await expect(service.applySuggestion(db.scope,sense.id,0,{meaningZh:'斜视'})).rejects.toMatchObject({status:409});
 await service.applySuggestion(db.scope,sense.id,1,{meaningZh:'斜视',tagsJson:'["work.marketing.ads"]'});
 const detail=await service.detail(db.scope,sense.id,'zh');expect(detail.contextMeaning).toBe('眯起眼睛看');expect(detail.tags).toEqual(['daily.body.visual']);expect(detail.meaningOrigin).toBe('manual');
});
it('denies unverified suggestion calls and foreign edits; concurrent manual edits use CAS',async()=>{
 const sense=await db.seedSense(),service=createVocabularyService(db.prisma);
 await expect(service.applySuggestion(db.scope,sense.id,0,{meaningZh:'AI'})).rejects.toMatchObject({status:403});
 await expect(service.edit({...db.scope,userId:'other-user'},sense.id,{revision:0,priority:1})).rejects.toMatchObject({status:404});
 const edits=await Promise.allSettled([service.edit(db.scope,sense.id,{revision:0,priority:1}),service.edit(db.scope,sense.id,{revision:0,priority:2})]);expect(edits.filter(x=>x.status==='fulfilled')).toHaveLength(1);
 await expect(service.edit(db.scope,sense.id,{revision:1,priority:99})).rejects.toThrow();
});
