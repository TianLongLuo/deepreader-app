import {validateMeaningGroupResult,type MeaningGroupResult} from '@/lib/meaning-groups';
/** Completed offsets only, bounded by both count and original UTF-16 characters. */
export function createMeaningResultCache(options:{maxUnits?:number;maxChars?:number}={}){
 const maxUnits=options.maxUnits??128,maxChars=options.maxChars??153600,entries=new Map<string,{chars:number;result:MeaningGroupResult}>();let chars=0;
 const copy=(r:MeaningGroupResult):MeaningGroupResult=>({text:r.text,groups:r.groups.map(span=>({...span})),verbs:r.verbs.map(span=>({...span}))});
 const remove=(key:string)=>{const entry=entries.get(key);if(entry){chars-=entry.chars;entries.delete(key);}};
 return {
  get(key:string){const entry=entries.get(key);if(!entry)return;entries.delete(key);entries.set(key,entry);return copy(entry.result);},
  set(key:string,text:string,result:MeaningGroupResult){const validated=validateMeaningGroupResult(text,result);remove(key);if(text.length>maxChars||maxUnits<1)return;entries.set(key,{chars:text.length,result:copy(validated)});chars+=text.length;while(entries.size>maxUnits||chars>maxChars)remove(entries.keys().next().value!);},
  stats:()=>({units:entries.size,chars}),clear(){entries.clear();chars=0;},
 };
}
