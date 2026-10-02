import {alignMeaningGroups,alignMeaningPrefix,MeaningGroupAlignmentError} from '@/lib/meaning-groups';

/** Optional emphasis must never invalidate otherwise exact source coverage.
 * The strict browser/cache validator is unchanged; no invented verb is painted.
 */
export function alignGeneratedMeaning(source:string,output:unknown,complete:boolean){
 const align=complete?alignMeaningGroups:alignMeaningPrefix;
 if(!output||typeof output!=='object'||!Array.isArray((output as {groups?:unknown}).groups))throw new MeaningGroupAlignmentError();
 const groups=(output as {groups:Array<{text?:unknown;verbs?:unknown}>}).groups;
 // Validate every source group and all coverage before handling decoration.
 align(source,{groups:groups.map(g=>({text:g?.text}))});
 const grounded=groups.map(g=>{
  const text=g.text as string,verbs:string[]=[];
  if(Array.isArray(g.verbs)&&g.verbs.length<=8){
   for(const candidate of g.verbs){
    if(typeof candidate!=='string')continue;
    try{alignMeaningGroups(text,{groups:[{text,verbs:[...verbs,candidate]}]});verbs.push(candidate);}
    catch(error){if(!(error instanceof MeaningGroupAlignmentError))throw error;}
   }
  }
  return {text,verbs};
 });
 return align(source,{groups:grounded});
}
