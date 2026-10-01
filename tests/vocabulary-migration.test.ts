import {afterEach,beforeEach,expect,it} from 'vitest';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {createVocabularyDB} from './helpers/vocabulary-db';
import {migrateSavedWords} from '@/server/vocabulary/migration';
let db:Awaited<ReturnType<typeof createVocabularyDB>>;
beforeEach(async()=>{db=await createVocabularyDB();});afterEach(async()=>{await db?.close();});
it('migrates twice preserving original evidence, legacy due and manual fields without invented logs',async()=>{
 const old=await db.seedWord({text:'squint',note:'{broken',reviewAt:new Date('2026-10-01T00:00:00Z'),reviewCount:7});
 for(const kind of ['note','bookmark','chat'])await db.seedWord({kind,text:kind,note:'Untouched'});
 await migrateSavedWords(db.prisma);const encounter=await db.prisma.vocabularyEncounter.findUniqueOrThrow({where:{readingEntryId:old.id}});
 await db.prisma.vocabularySense.update({where:{id:encounter.senseId},data:{manualMeaningZh:'人工释义',revision:3}});
 await migrateSavedWords(db.prisma);
 expect(await db.prisma.vocabularyEncounter.count()).toBe(1);
 expect((await db.prisma.readingEntry.findUniqueOrThrow({where:{id:old.id}})).note).toBe('{broken');
 expect((await db.prisma.vocabularySense.findUniqueOrThrow({where:{id:encounter.senseId}})).manualMeaningZh).toBe('人工释义');
 const card=await db.prisma.reviewCard.findFirstOrThrow();expect(card.due).toEqual(old.reviewAt);expect(JSON.parse(card.stateJson).reps).toBe(0);expect(await db.prisma.reviewLog.count()).toBe(0);
 expect(await db.prisma.readingEntry.count()).toBe(4);
});
it('keeps unresolved same spelling and Spanish homographs as separate senses',async()=>{
 for(const [sourceLanguage,location] of [['en','a'],['en','b'],['es','c']])await db.seedWord({text:'pie',location,note:JSON.stringify({sourceLanguage,context:'A pie.'})});
 expect((await migrateSavedWords(db.prisma)).linked).toBe(3);
 expect(await db.prisma.vocabularySense.count()).toBe(3);expect(await db.prisma.reviewCard.count()).toBe(3);
});
it('uses explicit versioned SQL once and rejects a changed checksum, without implicit database access',()=>{
 const run=(args:string[])=>execFileSync(process.execPath,['scripts/migrate-learning-schema.mjs',...args],{stdio:'pipe'}).toString();
 expect(()=>run([])).toThrow();expect(()=>run(['--database','relative.db'])).toThrow();
 expect(run(['--database',db.path])).toContain('already applied');
 const sql=readFileSync('prisma/learning-migrations/001-vocabulary.sql','utf8');
 const altered=db.directory+'/changed.sql';writeFileSync(altered,sql+'\n-- changed\n');
 expect(()=>run(['--database',db.path,'--migration',altered,'--version','001-vocabulary'])).toThrow();
});
