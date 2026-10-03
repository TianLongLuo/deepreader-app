import {shouldDismiss} from './floating-study-policy';
/** Parent events never bubble out of an EPUB iframe: own listeners in each live document. */
export function installStudyDismiss(root:Element,pinned:()=>boolean,close:()=>void){
 const doc=root.ownerDocument,win=doc.defaultView,owned=new Map<Document,()=>void>(),loads=new Map<HTMLIFrameElement,()=>void>();
 const outside=(event:Event)=>{
  const target=event.target as Element|null;
  if(target?.nodeType===1&&target.closest('[data-study-panel], [data-reader-utility]'))return;
  if(shouldDismiss('outside',pinned()))close();
 };
 const scroll=(event:Event)=>{
  const target=event.target as Element|null;
  if(target?.nodeType===1&&target.closest('[data-study-panel], [data-reader-utility]'))return;
  if(shouldDismiss('scroll',pinned()))close();
 };
 function bind(target:Document){if(owned.has(target))return;target.addEventListener('pointerdown',outside,true);target.addEventListener('scroll',scroll,true);owned.set(target,()=>{target.removeEventListener('pointerdown',outside,true);target.removeEventListener('scroll',scroll,true);});}
 const parentOutside=(event:Event)=>{const target=event.target as Element|null;if(target?.nodeType===1&&target.tagName==='IFRAME'&&root.contains(target))return;outside(event);};
 doc.addEventListener('pointerdown',parentOutside,true);
 const parentScroll=(event:Event)=>{const target=event.target as Element|null;if(target?.nodeType===1&&root.contains(target)&&!target.closest('[data-study-panel], [data-reader-utility]'))scroll(event);};
 root.addEventListener('scroll',parentScroll,true);
 function refresh(){
  const frames=Array.from(root.querySelectorAll('iframe')),live=new Set<Document>();
  for(const f of frames){if(!loads.has(f)){const load=()=>refresh();f.addEventListener('load',load);loads.set(f,()=>f.removeEventListener('load',load));}try{if(f.contentDocument){live.add(f.contentDocument);bind(f.contentDocument);}}catch{/* Cross-origin frames are outside the local book. */}}
  for(const [d,off] of owned)if(!live.has(d)){off();owned.delete(d);}
  for(const [f,off] of loads)if(!frames.includes(f)){off();loads.delete(f);}
 }
 const observer=win?new win.MutationObserver(refresh):null;observer?.observe(root,{childList:true,subtree:true});refresh();
 return()=>{observer?.disconnect();doc.removeEventListener('pointerdown',parentOutside,true);root.removeEventListener('scroll',parentScroll,true);for(const off of owned.values())off();for(const off of loads.values())off();owned.clear();loads.clear();};
}
