/** Offsets always refer to canonical, unchanged UTF-16 source text. */
export type MeaningSpan={start:number;end:number;text:string};
export type MeaningGroupResult={text:string;groups:MeaningSpan[];verbs:MeaningSpan[]};
export const MEANING_GROUP_MAX_TEXT=4000;
export const normalizeMeaningText=(text:string)=>text.replace(/\s+/g,' ').trim();
const wordCharacter=(text:string)=>/[\p{L}\p{M}\p{N}'’\-]/u.test(text);
const boundary=(text:string,offset:number)=>offset===0||offset===text.length||!wordCharacter(text[offset-1])||!wordCharacter(text[offset]);
const invalid=()=>{throw new Error('意群结果未通过原文校验');};
export function alignMeaningGroups(source:string,output:unknown):MeaningGroupResult{
 const text=normalizeMeaningText(source);
 if(!text||text.length>MEANING_GROUP_MAX_TEXT||!output||typeof output!=='object')return invalid();
 const chunks=(output as {groups?:unknown}).groups;
 if(!Array.isArray(chunks)||!chunks.length||chunks.length>256)return invalid();
 const groups:MeaningSpan[]=[],verbs:MeaningSpan[]=[];let cursor=0;
 for(const item of chunks){
  if(!item||typeof item!=='object'||typeof item.text!=='string')return invalid();
  const phrase=item.text.trim();if(!phrase)return invalid();
  const start=text.indexOf(phrase,cursor),end=start+phrase.length;
  if(start<cursor||text.slice(cursor,start).trim()||!boundary(text,start)||!boundary(text,end))return invalid();
  groups.push({start,end,text:phrase});cursor=end;
  if(item.verbs!==undefined&&(!Array.isArray(item.verbs)||item.verbs.length>8))return invalid();
  let verbCursor=0;
  for(const verb of item.verbs??[]){
   if(typeof verb!=='string'||!verb.trim())return invalid();
   const exact=verb.trim(),local=phrase.indexOf(exact,verbCursor),verbEnd=local+exact.length;
   if(local<verbCursor||!boundary(text,start+local)||!boundary(text,start+verbEnd))return invalid();
   verbs.push({start:start+local,end:start+verbEnd,text:exact});verbCursor=verbEnd;
  }
 }
 if(text.slice(cursor).trim())return invalid();
 return {text,groups,verbs};
}
/** Revalidate server/cache responses before drawing ranges in the browser. */
export function validateMeaningGroupResult(source:string,value:unknown):MeaningGroupResult{
 const text=normalizeMeaningText(source),r=value as MeaningGroupResult;
 if(!r||r.text!==text||!Array.isArray(r.groups)||!Array.isArray(r.verbs)||r.verbs.length>2048)return invalid();
 let previous=0;
 for(const span of [...r.groups,...r.verbs]){
  if(!span||!Number.isInteger(span.start)||!Number.isInteger(span.end)||span.start<0||span.start>=span.end||span.end>text.length||span.text!==text.slice(span.start,span.end))return invalid();
 }
 for(const verb of r.verbs){if(verb.start<previous||!r.groups.some(g=>verb.start>=g.start&&verb.end<=g.end))return invalid();previous=verb.end;}
 const aligned=alignMeaningGroups(text,{groups:r.groups.map(g=>({text:g.text,verbs:r.verbs.filter(v=>v.start>=g.start&&v.end<=g.end).map(v=>v.text)}))});
 const sameSpans=(a:MeaningSpan[],b:MeaningSpan[])=>a.length===b.length&&a.every((span,i)=>span.start===b[i].start&&span.end===b[i].end&&span.text===b[i].text);
 if(!sameSpans(aligned.groups,r.groups)||!sameSpans(aligned.verbs,r.verbs))return invalid();
 return aligned;
}
