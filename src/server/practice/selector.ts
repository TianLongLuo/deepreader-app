import type {PrismaClient} from '@prisma/client';
import {practiceInputSchema,type PracticeTarget,type PracticeDeferred} from './types';
import {contextualMeaning} from '@/server/vocabulary/meaning';
import {vocabularyWhere,stringList} from '@/server/vocabulary/query';
import {vocabularyDomains} from '@/lib/vocabulary-taxonomy';
import type {LearningScope} from '@/server/vocabulary/types';
/** Lemma and observed surfaces are evidence, never an exhaustive morphology dictionary. */
function forms(lemma:string,_pos:string,language:string,surfaces:string[]){
 return [...new Set([lemma,...surfaces].map(x=>x.normalize('NFC').toLocaleLowerCase(language)).filter(x=>x.length>0&&x.length<=200))].slice(0,16);
}
const family=(domain:string|null)=>domain?.split('.').slice(0,2).join('.')??'unclassified';
export function createPracticeSelector(db:PrismaClient){return async(scope:LearningScope,input:unknown)=>{
 const data=practiceInputSchema.parse(input),now=new Date(),recent=new Date(now.getTime()-14*86400000);
 const rows=await db.vocabularySense.findMany({where:{AND:[vocabularyWhere(scope),{sourceLanguage:data.sourceLanguage,...(data.senseIds?{id:{in:data.senseIds}}:{})}]},orderBy:[{priority:'desc'},{createdAt:'desc'},{id:'asc'}],take:200,include:{cards:{where:{ability:'recognition',archivedAt:null},include:{logs:{where:{...scope,reviewedAt:{gte:recent},rating:'again'},take:1}}},encounters:{where:{...scope,document:{workspaceId:scope.workspaceId,status:{notIn:['DELETED','DELETING']}}},orderBy:{createdAt:'desc'},take:8}}});
 const usable=rows.map(row=>({...row,effective:contextualMeaning(row,'',data.definitionLanguage).meaning})).filter(row=>row.effective.trim());
 usable.sort((a,b)=>Number(b.cards.some(c=>c.logs.length>0))-Number(a.cards.some(c=>c.logs.length>0))||Number(b.cards.some(c=>c.due<=now))-Number(a.cards.some(c=>c.due<=now))||b.priority-a.priority||a.id.localeCompare(b.id));
 const domainOf=(row:typeof usable[number])=>row.manualTagsJson!==null?stringList(row.manualTagsJson).find(code=>Object.hasOwn(vocabularyDomains,code))??null:row.domain;
 const groups=new Map<string,Set<string>>();for(const row of usable){const key=family(domainOf(row)),set=groups.get(key)??new Set<string>();set.add(row.lemma);groups.set(key,set);}
 const minimum=data.mode==='reading'?3:2,ranked=Array.from(groups),group=ranked.find(([,words])=>words.size>=minimum)?.[0]??ranked.sort(([,a],[,b])=>b.size-a.size)[0]?.[0];
 const targets:PracticeTarget[]=[],deferred:PracticeDeferred[]=[],lemmas=new Set<string>();
 for(const row of usable){const domain=domainOf(row),reason=group&&family(domain)!==group?'使用场景不同，留到下一组':lemmas.has(row.lemma)?'同词不同义分开练习':targets.length>=data.targetCount?'本次目标数量已满':'';
  if(reason){deferred.push({senseId:row.id,lemma:row.lemma,reason});continue;}lemmas.add(row.lemma);targets.push({senseId:row.id,lemma:row.lemma,meaning:row.effective,domain,forms:forms(row.lemma,row.pos,data.sourceLanguage,row.encounters.map(e=>e.surface)),revision:row.revision});
 }
 return {targets,deferredIds:deferred.map(row=>row.senseId),deferred};
};}
