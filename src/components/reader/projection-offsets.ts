export type EndpointBias = 'before' | 'after';
export type ProjectionChange = Readonly<{id:string;start:number;end:number;replacement:string}>;
export interface OffsetProjection {
 readonly original:string;
 text():string;
 changes():readonly ProjectionChange[];
 apply(change:ProjectionChange):void;
 restore(id:string):void;
 restoreAll():void;
 toOriginal(displayOffset:number,bias:EndpointBias):number;
 toDisplay(originalOffset:number,bias:EndpointBias):number;
 at(displayOffset:number):ProjectionChange|null;
}

type DisplayChange=ProjectionChange&{displayStart:number;displayEnd:number};
/** Offsets are literal UTF-16; no spelling, whitespace or Unicode normalization. */
export function isCodePointBoundary(text:string,offset:number):boolean {
 if(offset<=0||offset>=text.length)return true;
 const before=text.charCodeAt(offset-1),after=text.charCodeAt(offset);
 return !(before>=0xd800&&before<=0xdbff&&after>=0xdc00&&after<=0xdfff);
}
function validOffset(offset:number,length:number){
 if(!Number.isSafeInteger(offset)||offset<0||offset>length)throw new RangeError('Invalid projection offset');
}

export function createOffsetProjection(original:string):OffsetProjection {
 let sorted:ProjectionChange[]=[],pieces:DisplayChange[]=[],display=original;
 const rebuild=()=>{
  let cursor=0;display='';pieces=[];
  for(const c of sorted){
   display+=original.slice(cursor,c.start);
   const displayStart=display.length;display+=c.replacement;
   pieces.push({...c,displayStart,displayEnd:display.length});cursor=c.end;
  }
  display+=original.slice(cursor);
 };
 return {
  original,text:()=>display,changes:()=>sorted.map(c=>({...c})),
  apply(change){
   validOffset(change.start,original.length);validOffset(change.end,original.length);
   if(change.end<=change.start||!isCodePointBoundary(original,change.start)||!isCodePointBoundary(original,change.end))
    throw new RangeError('Invalid original replacement span');
   if(!change.id||!change.replacement.trim())throw new RangeError('Empty replacement');
   const others=sorted.filter(c=>c.id!==change.id);
   if(others.some(c=>change.start<c.end&&change.end>c.start))throw new RangeError('Overlapping replacement');
   sorted=[...others,{...change}].sort((a,b)=>a.start-b.start);rebuild();
  },
  restore(id){const next=sorted.filter(c=>c.id!==id);if(next.length!==sorted.length){sorted=next;rebuild();}},
  restoreAll(){sorted=[];rebuild();},
  toOriginal(offset,bias){
   validOffset(offset,display.length);let delta=0;
   for(const p of pieces){
    if(offset<p.displayStart)return offset-delta;
    if(offset===p.displayStart)return p.start;
    if(offset<p.displayEnd)return bias==='before'?p.start:p.end;
    if(offset===p.displayEnd)return p.end;
    delta=p.displayEnd-p.end;
   }
   return offset-delta;
  },
  toDisplay(offset,bias){
   validOffset(offset,original.length);let delta=0;
   for(const p of pieces){
    if(offset<p.start)return offset+delta;
    if(offset===p.start)return p.displayStart;
    if(offset<p.end)return bias==='before'?p.displayStart:p.displayEnd;
    if(offset===p.end)return p.displayEnd;
    delta=p.displayEnd-p.end;
   }
   return offset+delta;
  },
  at(offset){
   validOffset(offset,display.length);
   const found=pieces.find(p=>offset>=p.displayStart&&offset<p.displayEnd);
   return found?{id:found.id,start:found.start,end:found.end,replacement:found.replacement}:null;
  },
 };
}
