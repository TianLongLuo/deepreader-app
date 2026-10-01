import {PrismaClient,type Prisma} from '@prisma/client';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createVocabularyService} from '@/server/vocabulary/service';
export async function createVocabularyDB(){
 const directory=mkdtempSync(join(tmpdir(),'deepreader-learning-test-')),path=join(directory,'test.db');writeFileSync(path,'');
 execFileSync(process.execPath,['--input-type=module','-e','import {DatabaseSync} from "node:sqlite";import fs from "node:fs";const db=new DatabaseSync(process.argv[1]);db.exec(fs.readFileSync("tests/fixtures/legacy-schema.sql","utf8"));db.close();',path],{stdio:'pipe'});
 execFileSync(process.execPath,['scripts/migrate-learning-schema.mjs','--database',path],{stdio:'pipe'});
 const prisma=new PrismaClient({datasourceUrl:'file:'+path}),scope={userId:'test-user',workspaceId:'test-workspace'};
 await prisma.user.createMany({data:[{id:scope.userId,email:'fixture@example.test',passwordHash:'unused'},{id:'other-user',email:'other@example.test',passwordHash:'unused'}]});
 await prisma.workspace.createMany({data:[{id:scope.workspaceId,name:'Fixture'},{id:'other-workspace',name:'Other'}]});
 const document=await prisma.document.create({data:{id:'test-document',userId:scope.userId,workspaceId:scope.workspaceId,title:'Just Until (Z-Library).epub',fileType:'EPUB',storageKey:'unused',fileSize:1,status:'READY'}});
 const seedWord=(overrides:Partial<Prisma.ReadingEntryUncheckedCreateInput>={})=>prisma.readingEntry.create({data:{userId:scope.userId,documentId:document.id,kind:'word',text:'squint',location:'epubcfi(/fixture)',note:JSON.stringify({context:'I squint against the wind.',contextMeaning:{zh:'眯起眼睛看'},sourceLanguage:'en'}),...overrides}});
 const seedSense=async(overrides:Partial<Prisma.VocabularySenseUncheckedUpdateInput>={})=>{const text=typeof overrides.lemma==='string'?overrides.lemma:'squint',sourceLanguage=typeof overrides.sourceLanguage==='string'?overrides.sourceLanguage:'en';const word=await seedWord({text,note:JSON.stringify({sourceLanguage,context:'I '+text+' against the wind.',contextMeaning:{zh:'眯起眼睛看'}})});const {senseId}=await createVocabularyService(prisma).capture(scope,word);return prisma.vocabularySense.update({where:{id:senseId},data:overrides});};
 const seedEnrichmentJob=()=>seedSense();
 return {prisma,scope,document,directory,path,seedWord,seedSense,seedEnrichmentJob,close:async()=>{await prisma.$disconnect();rmSync(directory,{recursive:true,force:true});}};
}
