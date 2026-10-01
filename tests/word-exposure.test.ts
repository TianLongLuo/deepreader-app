import {afterEach,beforeEach,expect,it} from 'vitest';
import {createVocabularyDB} from './helpers/vocabulary-db';
import {createExposureService,recordParsedExposuresIn} from '@/server/vocabulary/exposures';
let db:Awaited<ReturnType<typeof createVocabularyDB>>;
beforeEach(async()=>{db=await createVocabularyDB();});afterEach(async()=>{await db?.close();});
it('counts actually processed positions once per source hash and preserves raw Unicode offsets',async()=>{
 const service=createExposureService(db.prisma),text='Café cafe\u0301 café. He squints, then squints again.';
 await service.recordExposures(db.scope,db.document.id,'en','chapter:1:p:2',text);const before=await db.prisma.wordExposure.count();await service.recordExposures(db.scope,db.document.id,'en','chapter:1:p:2',text);expect(await db.prisma.wordExposure.count()).toBe(before);
 expect((await service.summary(db.scope,'en','café')).positions).toBe(3);expect((await service.summary(db.scope,'en','squints')).positions).toBe(2);expect((await service.summary(db.scope,'en','squints')).documents).toBe(1);
 await service.recordExposures(db.scope,db.document.id,'en','chapter:1:p:2',text+' Changed.');expect(await db.prisma.wordExposure.count()).toBeGreaterThan(before);expect((await service.summary(db.scope,'en','squints')).positions).toBe(2);
 expect((await service.summary(db.scope,'es','café')).positions).toBe(0);
});
it('rejects missing stable positions and foreign/deleted documents without trusting capture counts',async()=>{
 const service=createExposureService(db.prisma);await expect(service.recordExposures(db.scope,db.document.id,'en','','A word.')).rejects.toMatchObject({status:400});
 await expect(service.recordExposures({userId:'other-user',workspaceId:'other-workspace'},db.document.id,'en','position','A word.')).rejects.toMatchObject({status:404});
 await db.seedSense();expect((await service.summary(db.scope,'en','squint')).positions).toBe(0);
 await db.prisma.document.update({where:{id:db.document.id},data:{status:'DELETED'}});await expect(service.recordExposures(db.scope,db.document.id,'en','position','A word.')).rejects.toMatchObject({status:404});
});
it('does not double-count a material indexed by both paragraph parsing and reader analysis',async()=>{
 const service=createExposureService(db.prisma);await service.recordExposures(db.scope,db.document.id,'en','epubcfi(/a)','A word.');await service.recordExposures(db.scope,db.document.id,'en','parsed:0:0','A word.');expect((await service.summary(db.scope,'en','word')).positions).toBe(1);
});

it('indexes nested parsed sections stably across re-parsing without counting paints',async()=>{
 const paragraph={rawText:'Café café.',normalizedText:'Café café.',sentences:[]},sections=[{title:'Parent',orderIndex:0,paragraphs:[paragraph],children:[{title:'Child',orderIndex:0,paragraphs:[paragraph],children:[]}]}];
 for(let i=0;i<2;i++)await db.prisma.$transaction(tx=>recordParsedExposuresIn(tx,db.scope,db.document.id,'es',sections));
 expect((await createExposureService(db.prisma).summary(db.scope,'es','café')).positions).toBe(4);expect(await db.prisma.wordExposure.count()).toBe(4);
});
