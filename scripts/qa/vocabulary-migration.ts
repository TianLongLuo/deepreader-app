/** Isolated fixture only; never reads an environment-selected/production database. */
import assert from 'node:assert/strict';
import {copyFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {PrismaClient} from '@prisma/client';
import {createVocabularyDB} from '../../tests/helpers/vocabulary-db';
import {migrateSavedWords} from '../../src/server/vocabulary/migration';
import {createVocabularyService} from '../../src/server/vocabulary/service';
import {createReviewService} from '../../src/server/review/service';
async function main(){
 const fixture=await createVocabularyDB();let copy:PrismaClient|undefined;
 try{
  const {prisma,scope,seedWord}=fixture;
  const english=await seedWord({id:'a',text:'pie',location:'epubcfi(/a)',reviewCount:8,reviewAt:new Date('2020-01-01'),note:JSON.stringify({sourceLanguage:'en',context:'The pie is sweet.',contextMeaning:{zh:'甜馅饼'}})});
  await seedWord({id:'b',text:'pie',location:'epubcfi(/b)',note:JSON.stringify({sourceLanguage:'en',context:'A pie chart.',contextMeaning:{zh:'饼图'}})});
  await seedWord({id:'c',text:'pie',location:'epubcfi(/c)',note:JSON.stringify({sourceLanguage:'es',context:'Me duele el pie.',contextMeaning:{zh:'脚'}})});
  await seedWord({id:'d',text:'unknown',location:'epubcfi(/d)',note:'{malformed original\n',reviewCount:6});
  for(const kind of ['note','bookmark','chat'])await seedWord({id:kind,kind,text:'Original '+kind,note:'Unchanged private fixture'});
  const removed=await prisma.document.create({data:{id:'removed',...scope,title:'Removed.epub',fileType:'EPUB',storageKey:'unused',fileSize:1,status:'DELETED'}});
  await seedWord({id:'removed-word',documentId:removed.id,note:'Deleted source remains untouched'});
  const before=await prisma.readingEntry.findMany({orderBy:{id:'asc'}});
  // Interrupt after one committed entry; preserve manual edits when resumed on a copy.
  const first=await createVocabularyService(prisma).capture(scope,english);
  await prisma.vocabularySense.update({where:{id:first.senseId},data:{manualMeaningZh:'人工：本句甜馅饼',manualTagsJson:'["人工标签"]',revision:4}});
  await prisma.$disconnect();const copyPath=join(fixture.directory,'interrupted-copy.db');copyFileSync(fixture.path,copyPath);
  copy=new PrismaClient({datasourceUrl:'file:'+copyPath});
  assert.equal((await migrateSavedWords(copy)).linked,3);assert.equal((await migrateSavedWords(copy)).linked,0);
  assert.deepEqual(await copy.readingEntry.findMany({orderBy:{id:'asc'}}),before);
  const senses=await copy.vocabularySense.findMany({orderBy:{lemma:'asc'}});assert.equal(senses.length,4);
  assert.equal(senses.filter(s=>s.lemma==='pie'&&s.sourceLanguage==='en').length,2);
  assert.equal(senses.filter(s=>s.lemma==='pie'&&s.sourceLanguage==='es').length,1);
  const manual=await copy.vocabularySense.findUniqueOrThrow({where:{id:first.senseId}});assert.equal(manual.manualMeaningZh,'人工：本句甜馅饼');assert.equal(manual.revision,4);
  assert.equal(await copy.reviewLog.count(),0);
  const review=createReviewService(copy),front=await review.front(scope,'zh');assert.ok(front);
  assert.equal((await review.reveal(scope,front.sessionId)).meaning,'人工：本句甜馅饼');
  await review.rate(scope,{sessionId:front.sessionId,operationId:'fixture-op',rating:'good'});
  const cards=await copy.reviewCard.findMany({orderBy:{id:'asc'}}),logs=await copy.reviewLog.findMany({orderBy:{id:'asc'}});
  assert.equal(logs.length,1);assert.equal(cards.find(c=>c.id===front.cardId)?.version,1);
  await migrateSavedWords(copy);
  assert.deepEqual(await copy.reviewCard.findMany({orderBy:{id:'asc'}}),cards);assert.deepEqual(await copy.reviewLog.findMany({orderBy:{id:'asc'}}),logs);
  assert.deepEqual(await copy.readingEntry.findMany({orderBy:{id:'asc'}}),before);
  await copy.$disconnect();
  // Simulate aborted additive SQL (first statement executed, next fails). Transaction rolls it all back.
  const invalid=join(fixture.directory,'interrupted.sql');writeFileSync(invalid,'CREATE TABLE interrupted_fixture (id TEXT); INSERT INTO missing_fixture VALUES (1);');
  assert.throws(()=>execFileSync(process.execPath,['scripts/migrate-learning-schema.mjs','--database',copyPath,'--migration',invalid,'--version','interrupted-fixture'],{stdio:'pipe'}));
  execFileSync(process.execPath,['scripts/migrate-learning-schema.mjs','--database',copyPath],{stdio:'pipe'});
  const integrity=execFileSync(process.execPath,['--input-type=module','-e',`import {DatabaseSync} from 'node:sqlite';import assert from 'node:assert/strict';const db=new DatabaseSync(process.argv[1]);assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='interrupted_fixture'").get().n,0);assert.equal(db.prepare("SELECT COUNT(*) n FROM learning_schema_versions WHERE version='interrupted-fixture'").get().n,0);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(Object.values(db.prepare('PRAGMA quick_check').get())[0],'ok');db.close();console.log('ok');`,copyPath],{encoding:'utf8',stdio:['ignore','pipe','pipe']});assert.equal(integrity.trim(),'ok');
  console.log(JSON.stringify({legacyRecordsPreserved:true,duplicateSensesPreserved:true,manualPreserved:true,reviewPreserved:true,interruptedCopyRecovered:true,integrity:'ok'}));
 }finally{await copy?.$disconnect();await fixture.close();}
}
void main().catch(()=>{console.error('Isolated migration verification failed');process.exitCode=1;});
