import type {PrismaClient,Prisma} from '@prisma/client';
import {z} from 'zod';
import {frequencyBand,frequencyNotice} from './frequency';
import {createExposureService} from './exposures';
import {reviewableSenseWhere} from '@/server/review/eligibility';
import {activeDocument,VocabularyError} from './scope';
import {contextualMeaning} from './meaning';
import type {LearningScope,MeaningLanguage,SourceLanguage} from './types';
import type {WordSummary,WordDetail} from '@/lib/vocabulary';
import {displayBookTitle} from '@/components/study/word-display';
export const vocabularyListSchema=z.object({q:z.string().trim().max(200).optional(),sourceLanguage:z.enum(['en','es']).optional(),definitionLanguage:z.enum(['en','zh']).default('zh'),pos:z.string().max(80).optional(),domain:z.string().max(100).optional(),frequency:z.enum(['common','general','less-common','unknown']).optional(),priority:z.coerce.number().int().min(0).max(3).optional(),state:z.enum(['new','learning','due']).optional(),cursor:z.string().max(512).optional(),limit:z.coerce.number().int().min(1).max(100).default(30)}).strict();
export function stringList(raw:string|null,limit=12){try{const value:unknown=JSON.parse(raw??'[]');return Array.isArray(value)?value.filter((v):v is string=>typeof v==='string'&&v.length<=200).slice(0,limit):[];}catch{return [];}}
export const vocabularyWhere=(scope:LearningScope):Prisma.VocabularySenseWhereInput=>({...scope,status:{notIn:['merged','deleted']},encounters:{some:{...scope,document:{workspaceId:scope.workspaceId,...activeDocument}}}});
const sourceWhere=(scope:LearningScope)=>({...scope,document:{workspaceId:scope.workspaceId,...activeDocument}});
function decodeCursor(value:string){try{const object=JSON.parse(Buffer.from(value,'base64url').toString('utf8'));return z.object({id:z.string().min(1).max(200),createdAt:z.string().datetime()}).strict().parse(object);}catch{throw new VocabularyError('分页游标不正确',400);}}
function encodeCursor(value:{id:string;createdAt:Date}){return Buffer.from(JSON.stringify({id:value.id,createdAt:value.createdAt.toISOString()})).toString('base64url');}
export function createVocabularyQuery(database:PrismaClient){
 const projection=(scope:LearningScope)=>({id:true,lemma:true,sourceLanguage:true,status:true,_count:{select:{learningEvidence:{where:{kind:'application',response:{...scope,status:{in:['ready','disputed']}}}}}},learningEvidence:{where:{kind:'application',response:{...scope,status:{in:['ready','disputed']}}},orderBy:[{createdAt:'desc' as const},{id:'desc' as const}],take:1,select:{result:true,usedHint:true,disputed:true,createdAt:true}},meaningEn:true,meaningZh:true,manualMeaningEn:true,manualMeaningZh:true,tagsJson:true,manualTagsJson:true,pos:true,domain:true,createdAt:true,enrichmentJobs:{orderBy:{expectedRevision:'desc' as const},take:1,select:{status:true}},cards:{where:{ability:'recognition',archivedAt:null},take:1,select:{due:true,version:true}},encounters:{where:sourceWhere(scope),orderBy:[{createdAt:'desc' as const},{id:'asc' as const}],take:1,select:{phonetic:true,legacyContextMeaning:true,targetSentence:true,document:{select:{title:true}}}}}) satisfies Prisma.VocabularySenseSelect;
 type Row=Prisma.VocabularySenseGetPayload<{select:ReturnType<typeof projection>}>;
 const summarize=(row:Row,language:MeaningLanguage):WordSummary=>{
  const encounter=row.encounters[0],meaning=contextualMeaning(row,encounter?.legacyContextMeaning??'',language),card=row.cards[0];
  const manual=meaning.definitionLanguage==='en'?row.manualMeaningEn:meaning.definitionLanguage==='zh'?row.manualMeaningZh:null;
  const tags=row.manualTagsJson!==null?stringList(row.manualTagsJson):[...(row.domain?[row.domain]:[]),...stringList(row.tagsJson)].filter((v,i,all)=>all.indexOf(v)===i);
  return {id:row.id,word:row.lemma,phonetic:encounter?.phonetic??'',contextMeaning:meaning.meaning,meaningOrigin:!meaning.meaning?'pending':meaning.definitionLanguage==='legacy'?'legacy':manual!==null?'manual':'ai',definitionLanguage:meaning.definitionLanguage,fallback:meaning.fallback,sentence:encounter?.targetSentence??'',bookTitle:displayBookTitle(encounter?.document.title??''),sourceLanguage:row.sourceLanguage as SourceLanguage,tags,recognitionState:!card||card.version===0?'new':card.due<=new Date()?'due':'learning',usageState:row._count.learningEvidence?'practiced':'unpracticed',usage:{attempts:row._count.learningEvidence,lastAt:row.learningEvidence[0]?.createdAt.toISOString()??null,lastResult:!row.learningEvidence[0]?null:row.learningEvidence[0].disputed?'disputed':row.learningEvidence[0].usedHint?'hinted':row.learningEvidence[0].result===true?'correct':row.learningEvidence[0].result===false?'needs-work':'uncertain'},due:card?.due.toISOString()??null,status:row.status,enrichmentStatus:row.enrichmentJobs[0]?.status};
 };
 const list=async(scope:LearningScope,input:unknown)=>{
  const data=vocabularyListSchema.parse(input),conditions:Prisma.VocabularySenseWhereInput[]=[vocabularyWhere(scope)];
  if(data.sourceLanguage)conditions.push({sourceLanguage:data.sourceLanguage});if(data.pos)conditions.push({pos:data.pos});
  if(data.priority!==undefined)conditions.push({priority:data.priority});
  if(data.frequency)conditions.push(data.frequency==='unknown'?{OR:[{frequencyZipf:null},{frequencyZipf:{lte:0}}]}:{frequencyZipf:data.frequency==='common'?{gte:4}:data.frequency==='general'?{gte:3,lt:4}:{gt:0,lt:3}});
  if(data.domain)conditions.push({OR:[{manualTagsJson:null,domain:data.domain},{manualTagsJson:{contains:JSON.stringify(data.domain)}}]});
  if(data.q){const q=data.q;conditions.push({OR:[{lemma:{contains:q}},{manualMeaningEn:{contains:q}},{manualMeaningZh:{contains:q}},{manualMeaningEn:null,meaningEn:{contains:q}},{manualMeaningZh:null,meaningZh:{contains:q}},{encounters:{some:{...sourceWhere(scope),OR:[{targetSentence:{contains:q}},{legacyContextMeaning:{contains:q}},{document:{title:{contains:q}}}]}}}]});}
  if(data.state)conditions.push({cards:{some:{ability:'recognition',archivedAt:null,...(data.state==='new'?{version:0}:data.state==='due'?{due:{lte:new Date()}}:{version:{gt:0},due:{gt:new Date()}})}}});
  const unpaged={AND:conditions};
  const dueCount=await database.reviewCard.count({where:{ability:'recognition',archivedAt:null,due:{lte:new Date()},sense:{AND:[unpaged,reviewableSenseWhere(scope)]}}});
  if(data.cursor){const cursor=decodeCursor(data.cursor),createdAt=new Date(cursor.createdAt);conditions.push({OR:[{createdAt:{lt:createdAt}},{createdAt,id:{lt:cursor.id}}]});}
  const rows=await database.vocabularySense.findMany({where:{AND:conditions},select:projection(scope),orderBy:[{createdAt:'desc'},{id:'desc'}],take:data.limit+1}),more=rows.length>data.limit,visible=rows.slice(0,data.limit);
  return {items:visible.map(row=>summarize(row,data.definitionLanguage)),nextCursor:more?encodeCursor(visible.at(-1)!):null,dueCount};
 };
 const detail=async(scope:LearningScope,id:string,language:MeaningLanguage):Promise<WordDetail>=>{
  const row=await database.vocabularySense.findFirst({where:{id,...vocabularyWhere(scope)},select:{...projection(scope),revision:true,priority:true,collocationsJson:true,frequencyZipf:true,frequencyVersion:true,frequencySource:true,encounters:{where:sourceWhere(scope),orderBy:[{createdAt:'desc'},{id:'asc'}],select:{id:true,documentId:true,location:true,surface:true,targetSentence:true,context:true,rawNote:true,legacyContextMeaning:true,dictionaryJson:true,phonetic:true,createdAt:true,document:{select:{title:true}}}}}});
  if(!row)throw new VocabularyError('词条不存在',404);
  return {...summarize(row,language),revision:row.revision,priority:row.priority,pos:row.pos,domain:row.domain,manualMeaning:{en:row.manualMeaningEn,zh:row.manualMeaningZh},manualTags:row.manualTagsJson===null?null:stringList(row.manualTagsJson),collocations:stringList(row.collocationsJson,2),frequency:{zipf:row.frequencyZipf,version:row.frequencyVersion,source:row.frequencySource,band:frequencyBand(row.frequencyZipf),notice:frequencyNotice},exposure:await createExposureService(database).summary(scope,row.sourceLanguage as SourceLanguage,row.lemma),sources:row.encounters.map(source=>{let dictionary:unknown=null;try{dictionary=JSON.parse(source.dictionaryJson);}catch{}return{id:source.id,documentId:source.documentId,bookTitle:displayBookTitle(source.document.title),location:source.location,surface:source.surface,sentence:source.targetSentence,context:source.context,rawNote:source.rawNote,legacyContextMeaning:source.legacyContextMeaning,dictionary,createdAt:source.createdAt.toISOString()};})};
 };
 return {list,detail};
}
