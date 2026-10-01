import {afterEach,beforeEach,expect,it} from 'vitest';
import {createVocabularyDB} from './helpers/vocabulary-db';
import {createPracticeSelector} from '@/server/practice/selector';
let db:Awaited<ReturnType<typeof createVocabularyDB>>;
beforeEach(async()=>{db=await createVocabularyDB();});afterEach(async()=>{await db?.close();});
const input={mode:'reading',sourceLanguage:'en',definitionLanguage:'zh',targetCount:6,wordCount:100,level:'B2'};
it('selects compatible domains, keeps homograph senses separate and returns deferred reasons',async()=>{
 const high=await db.seedSense({lemma:'budget',domain:'work.marketing.budget',priority:3});const compatible=await db.seedSense({lemma:'allocate',domain:'work.marketing.advertising'});const foreignDomain=await db.seedSense({lemma:'squint',domain:'daily.body.visual'});const homograph=await db.seedSense({lemma:'budget',domain:'work.marketing.budget'});
 const result=await createPracticeSelector(db.prisma)(db.scope,input);
 expect(result.targets.map(x=>x.senseId)).toEqual([high.id,compatible.id]);expect(result.deferredIds).toEqual(expect.arrayContaining([foreignDomain.id,homograph.id]));expect(result.deferred.every(x=>x.reason.length>0)).toBe(true);
});
it('bounds modes and excludes other users, missing meanings and deleted sources',async()=>{
 await db.seedSense({lemma:'ready',domain:'daily.body.visual'});await db.seedSense({lemma:'empty',meaningZh:'',meaningEn:''});
 const select=createPracticeSelector(db.prisma);expect((await select({...db.scope,userId:'other-user'},input)).targets).toHaveLength(0);
 expect((await select(db.scope,input)).targets.map(x=>x.lemma)).toEqual(['ready']);
 await expect(select(db.scope,{...input,targetCount:13})).rejects.toThrow();await expect(select(db.scope,{...input,mode:'application',wordCount:100})).rejects.toThrow();
 await db.prisma.document.update({where:{id:db.document.id},data:{status:'DELETED'}});expect((await select(db.scope,input)).targets).toHaveLength(0);
});
it('ranks recent mistakes, due recognition and personal priority stably and preserves observed forms',async()=>{
 const low=await db.seedSense({lemma:'low',priority:0}),high=await db.seedSense({lemma:'high',priority:3});await db.prisma.reviewCard.updateMany({where:{senseId:low.id},data:{due:new Date('2100-01-01')}});
 const result=await createPracticeSelector(db.prisma)(db.scope,input);expect(result.targets.map(x=>x.senseId)).toEqual([high.id,low.id]);
 expect(result.targets[0].forms).toContain('high');expect(result.targets[0].meaning).toBe('眯起眼睛看');
});
it('prioritizes a recent actual Again log over an unpracticed high-priority word',async()=>{
 const wrong=await db.seedSense({lemma:'wrong',priority:0}),important=await db.seedSense({lemma:'important',priority:3});const card=await db.prisma.reviewCard.findFirstOrThrow({where:{senseId:wrong.id}});
 await db.prisma.reviewLog.create({data:{...db.scope,cardId:card.id,operationId:'actual-again',sessionId:'test-log',rating:'again',reviewedAt:new Date(),beforeJson:card.stateJson,afterJson:card.stateJson,logJson:'{}'}});
 const selection=await createPracticeSelector(db.prisma)(db.scope,input);expect(selection.targets.map(t=>t.senseId)).toEqual([wrong.id,important.id]);
});
it('does not let one high-ranked isolated word block a usable compatible training group',async()=>{
 const lonely=await db.seedSense({lemma:'squint',domain:'daily.body.visual',priority:3});const ids=[];for(const lemma of ['allocate','budget','campaign'])ids.push((await db.seedSense({lemma,domain:'work.marketing.ads'})).id);
 const selected=await createPracticeSelector(db.prisma)(db.scope,input);expect(selected.targets.map(t=>t.senseId)).toEqual(expect.arrayContaining(ids));expect(selected.targets).toHaveLength(3);expect(selected.deferredIds).toContain(lonely.id);
});
