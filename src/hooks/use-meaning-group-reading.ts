'use client';
import {useEffect,useRef,useState,type RefObject} from 'react';
import {validateMeaningGroupResult,validateMeaningGroupPrefix,type MeaningGroupResult} from '@/lib/meaning-groups';
import {createMeaningGroupQueue,meaningRetryAfterMs,type MeaningGroupStatus} from '@/components/reader/meaning-group-queue';
import {clearMeaningHighlights,paintMeaningHighlights,supportsMeaningHighlights,sameMeaningElements} from '@/components/reader/meaning-group-highlights';
import {collectMeaningSources,observeMeaningSources,sourceRange,type MeaningTextSource} from '@/components/reader/meaning-text-source';
import {consumeAIStream,AIStreamError} from '@/lib/ai-stream';
import {createProcessedExposureQueue} from '@/lib/processed-exposures';
import {splitMeaningText} from '@/lib/meaning-group-units';
const empty:MeaningGroupStatus={pending:0,ready:0,failed:0,blocked:false,deferred:0,retryAt:null};
export function useMeaningGroupReading({root,documentId,userId,language,enabled,theme,lowSaturation=false,locationFor}:{root:RefObject<HTMLDivElement|null>;documentId:string;userId:string;language:'en'|'es';enabled:boolean;theme:'light'|'dark'|'sepia';lowSaturation?:boolean;locationFor?:(source:MeaningTextSource,range:Range)=>string|null}){
 const [state,setState]=useState({...empty,unsupported:false,skipped:0});
 const cacheRef=useRef({scope:'',values:new Map<string,MeaningGroupResult>()});
 const retryRef=useRef(()=>{});
 useEffect(()=>{
  const scope=[userId,documentId,language].join(':');
  if(cacheRef.current.scope!==scope)cacheRef.current={scope,values:new Map()};
  if(!enabled){setState({...empty,unsupported:false,skipped:0});return;}
  const container=root.current;if(!container)return;
  let disposed=false,raf=0,dirty=true,lastSignature='';let lastElements:HTMLElement[]=[];
  const docs=new Map<Document,{root:Element;observer:MutationObserver}>();
  const sourceCache=new Map<Element,MeaningTextSource[]>();
  const unitCache=new Map<MeaningTextSource,Array<{text:string;start:number;end:number;range:Range}>|null>();
  const observe=(doc:Document,within:Element)=>{
   if(docs.get(doc)?.root===within)return;
   docs.get(doc)?.observer.disconnect();
   const observer=observeMeaningSources(within,()=>{dirty=true;sourceCache.clear();unitCache.clear();});
   docs.set(doc,{root:within,observer});
  };
  const notify=()=>{if(!disposed&&!raf)raf=window.requestAnimationFrame(()=>{raf=0;refresh();});};
  const locationCache=new WeakMap<Range,string|null>();
  const exposures=createProcessedExposureQueue(async(units,signal)=>{const response=await fetch('/api/study/exposures',{method:'POST',headers:{'Content-Type':'application/json'},signal,body:JSON.stringify({documentId,sourceLanguage:language,units})});if(!response.ok)throw new Error('Exposure recording failed');});
  const prefixes=new Map<string,MeaningGroupResult>();
  const queue=createMeaningGroupQueue(async(text,signal)=>{
   prefixes.delete(text);
   try{
    const response=await fetch('/api/meaning-groups',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/x-ndjson'},signal,body:JSON.stringify({documentId,sourceLanguage:language,text})});
    if(!response.ok)throw Object.assign(new Error('Meaning group request failed'),{status:response.status,retryAfterMs:meaningRetryAfterMs(response.headers.get('Retry-After'))});
    const value=await consumeAIStream<MeaningGroupResult>(response,signal,event=>{
     if(!signal.aborted&&event.type==='unit'){
      const prefix=validateMeaningGroupPrefix(text,event.value);
      if(event.index!==prefix.groups.length-1)throw new AIStreamError('INVALID_OUTPUT','');
      prefixes.set(text,prefix);dirty=true;notify();
     }
    });
    signal.throwIfAborted();prefixes.delete(text);dirty=true;
    return validateMeaningGroupResult(text,value);
   }catch(error){
    prefixes.delete(text);dirty=true;notify();
    if(error instanceof AIStreamError&&error.code==='RATE_LIMITED')throw Object.assign(error,{status:429});
    if(error instanceof AIStreamError&&['UNAVAILABLE','STREAM_UNSUPPORTED'].includes(error.code))throw Object.assign(error,{status:503});
    throw error;
   }
  },notify,cacheRef.current.values);
  retryRef.current=()=>{queue.retry();};
  const intersect=(a:{left:number;right:number;top:number;bottom:number},b:{left:number;right:number;top:number;bottom:number})=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
  const refresh=()=>{
   if(disposed)return;
   const body=container.querySelector<HTMLElement>('[data-reading-body]');if(!body)return;
   const frame=body.getBoundingClientRect(),outer={left:Math.max(0,frame.left),top:Math.max(0,frame.top),right:Math.min(window.innerWidth,frame.right),bottom:Math.min(window.innerHeight,frame.bottom)};
   const sources:Array<{doc:Document;within:Element;offset:{left:number;top:number};clip:typeof outer}>=[];
   if(body.querySelector('[data-pdf-selection-key]'))sources.push({doc:container.ownerDocument,within:body,offset:{left:0,top:0},clip:outer});
   for(const iframe of body.querySelectorAll('iframe')){
    try{const doc=iframe.contentDocument;if(!doc?.body)continue;const r=iframe.getBoundingClientRect();if(!intersect(r,outer))continue;sources.push({doc,within:doc.body,offset:{left:r.left,top:r.top},clip:{left:Math.max(outer.left,r.left),right:Math.min(outer.right,r.right),top:Math.max(outer.top,r.top),bottom:Math.min(outer.bottom,r.bottom)}});}catch{/* Ignore non-book/cross-origin frames. */}
   }
   const liveDocs=new Set(sources.map(s=>s.doc));
   for(const [doc,watched] of docs)if(!liveDocs.has(doc)){watched.observer.disconnect();clearMeaningHighlights(doc);docs.delete(doc);sourceCache.clear();unitCache.clear();dirty=true;}
   const visible:Array<{source:MeaningTextSource;text:string;offset:number;doc:Document;location:string|null}>=[];let unsupported=false,skipped=0;
   for(const frameSource of sources){
    observe(frameSource.doc,frameSource.within);
    let passages=sourceCache.get(frameSource.within);
    if(!passages){passages=collectMeaningSources(frameSource.within);sourceCache.set(frameSource.within,passages);}
    for(const passage of passages){
     let units=unitCache.get(passage);
     if(units===undefined){try{units=splitMeaningText(passage.text,1200,language).map(unit=>({...unit,range:sourceRange(passage,unit.start,unit.end)}));}catch{units=null;}unitCache.set(passage,units);}
     if(!units){skipped++;continue;}
     const scroll=passage.element.closest('[data-pdf-text-scroll]')?.getBoundingClientRect();
     for(const unit of units){
      const range=unit.range;
      // A spanning paragraph box can cross pages; only actual text rectangles count.
      const onScreen=Array.from(range.getClientRects()).some(r=>r.width>0&&r.height>0&&intersect({left:r.left+frameSource.offset.left,right:r.right+frameSource.offset.left,top:r.top+frameSource.offset.top,bottom:r.bottom+frameSource.offset.top},frameSource.clip)&&(!scroll||intersect(r,scroll)));
      if(!onScreen)continue;
      if(!supportsMeaningHighlights(frameSource.doc)){unsupported=true;continue;}
      if(!locationCache.has(range))locationCache.set(range,locationFor?.(passage,range)??null);
      visible.push({source:passage,text:unit.text,offset:unit.start,doc:frameSource.doc,location:locationCache.get(range)??null});
     }
    }
   }
   // Queue at most the visible passage, not every paragraph in a loaded chapter.
   queue.setVisible(visible.map(v=>v.text));
   // Record only a validated completed unit, including cache hits at new source positions.
   for(const item of visible)if(item.location&&queue.get(item.text))exposures.add({location:item.location,sourceText:item.text});
   const status=queue.status();
   const signature=JSON.stringify(visible.map(v=>[v.text,Boolean(queue.get(v.text))]));
   const elements=visible.map(v=>v.source.element);
   if(dirty||signature!==lastSignature||!sameMeaningElements(elements,lastElements)){
    for(const doc of docs.keys())paintMeaningHighlights(doc,visible.flatMap(v=>{const result=queue.get(v.text)??prefixes.get(v.text);return v.doc===doc&&result?[{source:v.source,result,offset:v.offset}]:[];}),theme,lowSaturation);
    dirty=false;lastSignature=signature;lastElements=elements;
   }
   const next={...status,unsupported,skipped};setState(old=>JSON.stringify(old)===JSON.stringify(next)?old:next);
  };
  refresh();
  const timer=window.setInterval(refresh,400);
  return()=>{disposed=true;window.clearInterval(timer);window.cancelAnimationFrame(raf);queue.dispose();exposures.dispose();retryRef.current=()=>{};for(const [doc,watched] of docs){watched.observer.disconnect();clearMeaningHighlights(doc);}};
 },[root,documentId,userId,language,enabled,theme,lowSaturation,locationFor]);
 return {...state,retry:()=>retryRef.current()};
}
