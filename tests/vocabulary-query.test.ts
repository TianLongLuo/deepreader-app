import {afterEach,beforeEach,expect,it} from 'vitest';
import {createVocabularyDB} from './helpers/vocabulary-db';
import {createVocabularyQuery} from '@/server/vocabulary/query';
import {createVocabularyService} from '@/server/vocabulary/service';
import {exportVocabulary} from '@/components/study/export';
let db:Awaited<ReturnType<typeof createVocabularyDB>>;
beforeEach(async()=>{db=await createVocabularyDB();});afterEach(async()=>{await db?.close();});
it('returns compact contextual rows, not raw notes/dictionaries or invented usage mastery',async()=>{
 await db.seedSense({pos:'verb',domain:'daily.body.visual',collocationsJson:'["squint at a screen","squint in sunlight","third"]'});
 const query=createVocabularyQuery(db.prisma),list=await query.list(db.scope,{definitionLanguage:'zh'});
 expect(list.items).toHaveLength(1);const row=list.items[0];expect(row).toMatchObject({word:'squint',contextMeaning:'眯起眼睛看',bookTitle:'Just Until',usageState:'unpracticed',recognitionState:'new'});expect(row).not.toHaveProperty('rawNote');expect(row).not.toHaveProperty('dictionaryJson');
 const detail=await query.detail(db.scope,row.id,'zh');expect(detail.collocations).toHaveLength(2);expect(detail.sources[0]).toHaveProperty('rawNote');
});
it('combines filters and effective-meaning/book/sentence search while excluding deleted and foreign words',async()=>{
 await db.seedSense({lemma:'squint',meaningZh:'旧释义',manualMeaningZh:'眯眼',pos:'verb',domain:'daily.body.visual'});
 await db.seedSense({lemma:'café',sourceLanguage:'es',pos:'noun',domain:'daily.home.cooking'});const query=createVocabularyQuery(db.prisma);
 expect((await query.list(db.scope,{q:'眯眼',sourceLanguage:'en',pos:'verb',domain:'daily.body.visual'})).items).toHaveLength(1);
 expect((await query.list(db.scope,{q:'旧释义'})).items).toHaveLength(0);
 expect((await query.list(db.scope,{q:'Just Until'})).items).toHaveLength(2);
 expect((await query.list({...db.scope,userId:'other-user'},{})).items).toHaveLength(0);
 await db.prisma.document.update({where:{id:db.document.id},data:{status:'DELETED'}});expect((await query.list(db.scope,{})).items).toHaveLength(0);
});
it('paginates stably and rejects malformed cursor or excessive limits',async()=>{
 for(let i=0;i<4;i++)await db.seedSense({lemma:'word'+i,createdAt:new Date('2026-10-01T00:00:00Z')});
 const query=createVocabularyQuery(db.prisma),first=await query.list(db.scope,{limit:2});expect(first.nextCursor).not.toBeNull();const second=await query.list(db.scope,{limit:2,cursor:first.nextCursor!});
 expect(new Set([...first.items,...second.items].map(x=>x.id)).size).toBe(4);expect(second.nextCursor).toBeNull();
 await expect(query.list(db.scope,{limit:101})).rejects.toThrow();await expect(query.list(db.scope,{cursor:'bad'})).rejects.toThrow();
});
it('exports contextual meaning with sources/manual provenance and license using formula-safe CSV',async()=>{
 const sense=await db.seedSense({lemma:'=SUM(A1)',manualMeaningZh:'人工说明'});const entry=await db.prisma.vocabularyEncounter.findFirstOrThrow();
 await db.prisma.vocabularyEncounter.update({where:{id:entry.id},data:{dictionaryJson:JSON.stringify({attribution:'Dictionary author',licenseUrl:'https://example.test/license',sourceUrl:'https://example.test/source'})}});
 const detail=await createVocabularyQuery(db.prisma).detail(db.scope,sense.id,'zh');const csv=exportVocabulary([detail],'csv'),md=exportVocabulary([detail],'md');
 expect(csv).toContain("'=SUM(A1)");expect(md).toContain('人工说明');expect(md).toContain('Dictionary author');expect(md).toContain('https://example.test/license');expect(md).toContain('epubcfi(/fixture)');expect(md).toContain('人工');
});
it('deleting a sense deletes its word evidence but preserves notes, bookmarks and chats',async()=>{
 const sense=await db.seedSense();for(const kind of ['note','bookmark','chat'])await db.seedWord({kind,text:kind});
 await createVocabularyService(db.prisma).remove(db.scope,sense.id);expect(await db.prisma.vocabularySense.count()).toBe(0);expect(await db.prisma.reviewCard.count()).toBe(0);expect((await db.prisma.readingEntry.findMany()).map(x=>x.kind).sort()).toEqual(['bookmark','chat','note']);
});
it('keeps pending words in the library but does not count answerless cards as ready for review',async()=>{
 await db.seedSense({meaningZh:'',meaningEn:''});const result=await createVocabularyQuery(db.prisma).list(db.scope,{});
 expect(result.items).toHaveLength(1);expect(result.dueCount).toBe(0);
});
it('keeps sourced frequency, processed positions and personal priority separate in details and exports',async()=>{
 const sense=await db.seedSense({frequencyZipf:4.1,frequencyVersion:'wordfreq-3.1.1',frequencySource:'https://github.com/rspeer/wordfreq',priority:2});
 const detail=await createVocabularyQuery(db.prisma).detail(db.scope,sense.id,'zh');expect(detail.frequency?.band).toBe('common');expect(detail.frequency?.notice).toContain('2021');expect(detail.exposure?.positions).toBe(0);expect(detail.priority).toBe(2);
 expect(exportVocabulary([detail],'md')).toContain('wordfreq-3.1.1');expect(exportVocabulary([detail],'csv')).toContain('frequency');
});

it('filters general frequency separately from personal priority, including unknown data',async()=>{
 await db.seedSense({lemma:'common',frequencyZipf:4.2,priority:0});await db.seedSense({lemma:'rare',frequencyZipf:2.4,priority:2});await db.seedSense({lemma:'unknown',frequencyZipf:null,priority:2});
 const query=createVocabularyQuery(db.prisma);
 expect((await query.list(db.scope,{frequency:'common'})).items.map(x=>x.word)).toEqual(['common']);
 expect((await query.list(db.scope,{frequency:'unknown',priority:2})).items.map(x=>x.word)).toEqual(['unknown']);
 expect((await query.list(db.scope,{priority:2})).items).toHaveLength(2);
 await expect(query.list(db.scope,{priority:10})).rejects.toThrow();
});
