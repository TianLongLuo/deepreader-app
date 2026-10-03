import {EpubCFI} from 'epubjs';
import type {MeaningTextSource} from './meaning-text-source';
import {wordAtPoint} from './study-interaction';
export type SourcePosition=Readonly<{kind:'epub';cfi:string}>|Readonly<{kind:'pdf';selectionKey:string;start:number;end:number}>;
export type Occurrence=Readonly<{id:string;position:SourcePosition;word:string;originalRange:Range}>;
export function occurrenceId(position:SourcePosition):string{
 return position.kind==='epub'?`epub:${position.cfi}`:`pdf:${encodeURIComponent(position.selectionKey)}:${position.start}:${position.end}`;
}
export function originalWordAtPoint(input:{document:Document;x:number;y:number;locate:(source:MeaningTextSource,range:Range)=>SourcePosition|null}):Occurrence|null{
 const hit=wordAtPoint(input.document,input.x,input.y,input.document.body);if(!hit)return null;
 const position=input.locate(hit.source,hit.originalRange);if(!position)return null;
 return {id:occurrenceId(position),position,word:hit.word,originalRange:hit.originalRange};
}
/** A CFI's spine identity is checked before resolving its path in any loaded document. */
export function findEpubSourceElement(contents:readonly {document:Document;cfiFromRange:(range:Range)=>string}[],cfi:string):HTMLElement|null{
 try{
  const target=new EpubCFI(cfi);
  for(const content of contents){
   const body=content.document.body,r=content.document.createRange();r.selectNodeContents(body);
   if(new EpubCFI(content.cfiFromRange(r)).spinePos!==target.spinePos)continue;
   const range=target.toRange(content.document),node=range.startContainer;
   const el=(node.nodeType===1?node as Element:node.parentElement)?.closest('p,li,blockquote,div');
   if(el)return el as HTMLElement;
  }
 }catch{/* A temporarily unloaded source is not replaced by identical text from another chapter. */}
 return null;
}
