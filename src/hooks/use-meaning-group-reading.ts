'use client';
import {useEffect,useRef,useState,type RefObject} from 'react';
import {normalizeMeaningText,validateMeaningGroupResult,MEANING_GROUP_MAX_TEXT,type MeaningGroupResult} from '@/lib/meaning-groups';
import {createMeaningGroupQueue,type MeaningGroupStatus} from '@/components/reader/meaning-group-queue';
import {clearMeaningHighlights,paintMeaningHighlights,supportsMeaningHighlights,meaningParagraphElements,sameMeaningElements} from '@/components/reader/meaning-group-highlights';
const empty:MeaningGroupStatus={pending:0,ready:0,failed:0,blocked:false};
export function useMeaningGroupReading({root,documentId,userId,language,enabled,theme}:{root:RefObject<HTMLDivElement|null>;documentId:string;userId:string;language:'en'|'es';enabled:boolean;theme:'light'|'dark'|'sepia'}){
 const [state,setState]=useState({...empty,unsupported:false,skipped:0});
 const cacheRef=useRef({scope:'',values:new Map<string,MeaningGroupResult>()});
 const retryRef=useRef(()=>{});
 useEffect(()=>{
  const scope=[userId,documentId,language].join(':');
  if(cacheRef.current.scope!==scope)cacheRef.current={scope,values:new Map()};
  if(!enabled){setState({...empty,unsupported:false,skipped:0});return;}
  const container=root.current;if(!container)return;
  let disposed=false,raf=0,dirty=true,lastSignature='';let lastElements:HTMLElement[]=[];
  const docs=new Map<Document,MutationObserver>();
  const observe=(doc:Document)=>{if(docs.has(doc)||!doc.body)return;const observer=new MutationObserver(()=>{dirty=true;});observer.observe(doc.body,{childList:true,subtree:true,characterData:true});docs.set(doc,observer);};
  const notify=()=>{if(!disposed&&!raf)raf=window.requestAnimationFrame(()=>{raf=0;refresh();});};
  const queue=createMeaningGroupQueue(async(text,signal)=>{
   const response=await fetch('/api/meaning-groups',{method:'POST',headers:{'Content-Type':'application/json'},signal,body:JSON.stringify({documentId,sourceLanguage:language,text})});
   if(!response.ok)throw Object.assign(new Error('Meaning group request failed'),{status:response.status});
   return validateMeaningGroupResult(text,await response.json());
  },notify,cacheRef.current.values);
  retryRef.current=()=>{queue.retry();};
  const intersect=(a:{left:number;right:number;top:number;bottom:number},b:{left:number;right:number;top:number;bottom:number})=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
  const refresh=()=>{
   if(disposed)return;
   const body=container.querySelector<HTMLElement>('[data-reading-body]');if(!body)return;
   const frame=body.getBoundingClientRect(),outer={left:Math.max(0,frame.left),top:Math.max(0,frame.top),right:Math.min(window.innerWidth,frame.right),bottom:Math.min(window.innerHeight,frame.bottom)};
   const sources:Array<{doc:Document;within:Element;offset:{left:number;top:number};clip:typeof outer}>=[];
   sources.push({doc:container.ownerDocument,within:body,offset:{left:0,top:0},clip:outer});
   for(const iframe of body.querySelectorAll('iframe')){
    try{const doc=iframe.contentDocument;if(!doc?.body)continue;const r=iframe.getBoundingClientRect();if(!intersect(r,outer))continue;sources.push({doc,within:doc.body,offset:{left:r.left,top:r.top},clip:{left:Math.max(outer.left,r.left),right:Math.min(outer.right,r.right),top:Math.max(outer.top,r.top),bottom:Math.min(outer.bottom,r.bottom)}});}catch{/* Ignore non-book/cross-origin frames. */}
   }
   const liveDocs=new Set(sources.map(s=>s.doc));
   for(const [doc,observer] of docs)if(!liveDocs.has(doc)){observer.disconnect();clearMeaningHighlights(doc);docs.delete(doc);dirty=true;}
   const visible:Array<{element:HTMLElement;text:string;doc:Document}>=[];let unsupported=false,skipped=0;
   for(const source of sources){
    observe(source.doc);
    for(const element of meaningParagraphElements(source.within)){
     const r=element.getBoundingClientRect(),rect={left:r.left+source.offset.left,right:r.right+source.offset.left,top:r.top+source.offset.top,bottom:r.bottom+source.offset.top};
     const scroll=element.closest('[data-pdf-text-scroll]')?.getBoundingClientRect();
     if(!r.width||!r.height||!intersect(rect,source.clip)||(scroll&&!intersect(r,scroll)))continue;
     if(!supportsMeaningHighlights(source.doc)){unsupported=true;continue;}
     const text=normalizeMeaningText(element.textContent??'');if(!text)continue;
     if(text.length>MEANING_GROUP_MAX_TEXT){skipped++;continue;}
     visible.push({element,text,doc:source.doc});
    }
   }
   // Queue at most the visible passage, not every paragraph in a loaded chapter.
   queue.setVisible(visible.slice(0,32).map(v=>v.text));
   const status=queue.status();
   const signature=JSON.stringify(visible.map(v=>[v.text,Boolean(queue.get(v.text))]));
   const elements=visible.map(v=>v.element);
   if(dirty||signature!==lastSignature||!sameMeaningElements(elements,lastElements)){
    for(const doc of docs.keys())paintMeaningHighlights(doc,visible.flatMap(v=>{const result=queue.get(v.text);return v.doc===doc&&result?[{element:v.element,result}]:[];}),theme);
    dirty=false;lastSignature=signature;lastElements=elements;
   }
   const next={...status,unsupported,skipped};setState(old=>JSON.stringify(old)===JSON.stringify(next)?old:next);
  };
  observe(container.ownerDocument);refresh();
  const timer=window.setInterval(refresh,400);
  return()=>{disposed=true;window.clearInterval(timer);window.cancelAnimationFrame(raf);queue.dispose();retryRef.current=()=>{};for(const [doc,observer] of docs){observer.disconnect();clearMeaningHighlights(doc);}};
 },[root,documentId,userId,language,enabled,theme]);
 return {...state,retry:()=>retryRef.current()};
}
