export const wordLookupBounds=(kind:'EPUB'|'PDF',flow:'vertical'|'paginated')=>kind==='PDF'||flow==='vertical'?'line' as const:'paragraph' as const;
import {originalRange,projectionFor,projectedRanges} from './original-text';
import {viewportAnchor,type StudyAnchor} from './floating-study-layout';
export type AnchorHandle={measure:()=>StudyAnchor|null;focus:()=>void;dispose:()=>void};
export function createAnchorHandle(initial:HTMLElement,range?:Range,findReplacement?:()=>HTMLElement|null,bounds:'selection'|'paragraph'|'line'='selection'):AnchorHandle{
 // Word lookup may highlight a range, but must leave its whole paragraph clickable.
 if(bounds==='paragraph')range=undefined;
 let disposed=false;
 let start=0,end=0;
 if(range){const canonical=originalRange(range),root=projectionFor(initial)?.canonicalNode(initial)??initial;const prefix=root.ownerDocument!.createRange();prefix.selectNodeContents(root);prefix.setEnd(canonical.startContainer,canonical.startOffset);start=prefix.toString().length;end=start+canonical.toString().length;}
 const element=()=>initial.isConnected?initial:findReplacement?.()??null;
 return {measure:()=>{
  if(disposed)return null;const el=element();if(!el)return null;
  let box=el.getBoundingClientRect();
  if(range){const root=projectionFor(el)?.canonicalNode(el)??el;const walker=root.ownerDocument!.createTreeWalker(root,4);let node:Node|null,offset=0;const current=root.ownerDocument!.createRange();let begun=false,finished=false;
   while((node=walker.nextNode())){const length=node.textContent?.length??0;if(!begun&&start<offset+length){current.setStart(node,Math.max(0,start-offset));begun=true;}if(begun&&end<=offset+length){current.setEnd(node,Math.max(0,end-offset));finished=true;break;}offset+=length;}
   if(!finished)return null;box=projectedRanges(current)[0].getBoundingClientRect();
   if(bounds==='line'){const paragraph=el.getBoundingClientRect();box={left:paragraph.left,right:paragraph.right,top:box.top-6,bottom:box.bottom+6,width:paragraph.width,height:box.height+12} as DOMRect;}
  }
  if(!box.width||!box.height)return null;
  const frame=el.ownerDocument.defaultView?.frameElement?.getBoundingClientRect();
  return viewportAnchor(box,frame);
 },focus:()=>{element()?.scrollIntoView({block:'nearest'});element()?.focus({preventScroll:true});},dispose:()=>{disposed=true;}};
}
