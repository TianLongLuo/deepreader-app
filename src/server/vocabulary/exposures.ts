import {createHash} from 'node:crypto';
import type {Prisma,PrismaClient} from '@prisma/client';
import {activeDocument,VocabularyError} from './scope';
import type {LearningScope,SourceLanguage} from './types';
/** Original UTF-16 offsets; NFC changes are applied only to the lookup lemma. */
export async function recordExposuresIn(tx:Prisma.TransactionClient,scope:LearningScope,documentId:string,language:SourceLanguage,location:string,sourceText:string){
 if(!location.trim()||location.length>1000||!['en','es'].includes(language)||sourceText.length>2*1024*1024)throw new VocabularyError('材料位置或长度不正确',400);
 if(!await tx.document.findFirst({where:{id:documentId,workspaceId:scope.workspaceId,...activeDocument},select:{id:true}}))throw new VocabularyError('文档不存在',404);
 const sourceHash=createHash('sha256').update(sourceText).digest('hex');let batch:Prisma.WordExposureCreateManyInput[]=[];
 const flush=async()=>{if(!batch.length)return;const existing=await tx.wordExposure.findMany({where:{...scope,documentId,sourceLanguage:language,sourceHash,location:{in:batch.map(row=>row.location)}},select:{location:true}}),seen=new Set(existing.map(row=>row.location)),fresh=batch.filter(row=>!seen.has(row.location));if(fresh.length)await tx.wordExposure.createMany({data:fresh});batch=[];};
 for(const token of sourceText.matchAll(/[\p{L}\p{M}]+(?:['’\-][\p{L}\p{M}]+)*/gu)){
  const lemma=token[0].normalize('NFC').toLocaleLowerCase(language).replaceAll('’',"'");if(lemma.length>200)continue;
  batch.push({...scope,documentId,sourceLanguage:language,location:location+'@'+token.index,lemma,sourceHash});if(batch.length>=500)await flush();
 }
 await flush();
}
export function createExposureService(db:PrismaClient){
 const recordExposures=(scope:LearningScope,documentId:string,language:SourceLanguage,location:string,sourceText:string)=>db.$transaction(tx=>recordExposuresIn(tx,scope,documentId,language,location,sourceText),{timeout:60000});
 const summary=async(scope:LearningScope,language:SourceLanguage,lemma:string)=>{
  const rows=await db.$queryRaw<Array<{positions:bigint;documents:bigint}>>`SELECT COUNT(DISTINCT e.documentId || char(0) || e.location) positions, COUNT(DISTINCT e.documentId) documents FROM word_exposures e JOIN documents d ON d.id=e.documentId WHERE e.userId=${scope.userId} AND e.workspaceId=${scope.workspaceId} AND d.workspaceId=${scope.workspaceId} AND d.status NOT IN ('DELETED','DELETING') AND e.sourceLanguage=${language} AND (e.location LIKE 'parsed:%' OR NOT EXISTS (SELECT 1 FROM word_exposures b WHERE b.userId=e.userId AND b.documentId=e.documentId AND b.sourceLanguage=e.sourceLanguage AND b.location LIKE 'parsed:%')) AND e.lemma=${lemma.normalize('NFC').toLocaleLowerCase(language)}`;
  return {positions:Number(rows[0]?.positions??0),documents:Number(rows[0]?.documents??0),label:'已处理材料中的出现位置数'};
 };
 return {recordExposures,summary};
}
/** Server parsing indexes stable section/paragraph paths, never random paragraph IDs. */
export async function recordParsedExposuresIn(tx:Prisma.TransactionClient,scope:LearningScope,documentId:string,language:SourceLanguage,sections:import('@/types/documents').ParsedSection[]){
 async function visit(section:import('@/types/documents').ParsedSection,path:string){for(let i=0;i<section.paragraphs.length;i++)await recordExposuresIn(tx,scope,documentId,language,'parsed:'+path+':'+i,section.paragraphs[i].rawText);for(let i=0;i<section.children.length;i++)await visit(section.children[i],path+'.'+i);}
 for(let i=0;i<sections.length;i++)await visit(sections[i],String(i));
}
