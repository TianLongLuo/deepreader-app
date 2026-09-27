import {viewportAnchor,type StudyAnchor} from './floating-study-layout';
export type AnchorHandle={measure:()=>StudyAnchor|null;focus:()=>void;dispose:()=>void};
export function createAnchorHandle(initial:HTMLElement,range?:Range,findReplacement?:()=>HTMLElement|null,bounds:'selection'|'paragraph'='selection'):AnchorHandle{
 // Word lookup may highlight a range, but must leave its whole paragraph clickable.
 if(bounds==='paragraph')range=undefined;
 let disposed=false;
 let start=0,end=0;
 if(range){const prefix=initial.ownerDocument.createRange();prefix.selectNodeContents(initial);prefix.setEnd(range.startContainer,range.startOffset);start=prefix.toString().length;end=start+range.toString().length;}
 const element=()=>initial.isConnected?initial:findReplacement?.()??null;
 return {measure:()=>{
  if(disposed)return null;const el=element();if(!el)return null;
  let box=el.getBoundingClientRect();
  if(range){const walker=el.ownerDocument.createTreeWalker(el,4);let node:Node|null,offset=0;const current=el.ownerDocument.createRange();let begun=false,finished=false;
   while((node=walker.nextNode())){const length=node.textContent?.length??0;if(!begun&&start<offset+length){current.setStart(node,Math.max(0,start-offset));begun=true;}if(begun&&end<=offset+length){current.setEnd(node,Math.max(0,end-offset));finished=true;break;}offset+=length;}
   if(!finished)return null;box=current.getBoundingClientRect();
  }
  if(!box.width||!box.height)return null;
  const frame=el.ownerDocument.defaultView?.frameElement?.getBoundingClientRect();
  return viewportAnchor(box,frame);
 },focus:()=>{element()?.scrollIntoView({block:'nearest'});element()?.focus({preventScroll:true});},dispose:()=>{disposed=true;}};
}
