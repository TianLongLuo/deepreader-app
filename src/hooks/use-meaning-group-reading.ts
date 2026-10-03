'use client';
import {useEffect,useRef,useState,type RefObject} from 'react';
import {validateMeaningGroupResult,validateMeaningGroupPrefix,type MeaningGroupResult} from '@/lib/meaning-groups';
import {createMeaningGroupQueue,meaningRetryAfterMs,type MeaningGroupStatus} from '@/components/reader/meaning-group-queue';
import {clearMeaningHighlights,paintMeaningHighlights,supportsMeaningHighlights} from '@/components/reader/meaning-group-highlights';
import {collectMeaningSources,sourceRange,type MeaningTextSource} from '@/components/reader/meaning-text-source';
import {consumeAIStream,AIStreamError} from '@/lib/ai-stream';
import {createProcessedExposureQueue} from '@/lib/processed-exposures';
import {splitMeaningText} from '@/lib/meaning-group-units';
import {projectionFor,projectedRanges} from '@/components/reader/original-text';
import type {TextProjection} from '@/components/reader/text-projection';
import type {createReaderAIClientBudget} from '@/components/reader/reader-ai-budget';
import {createMeaningResultCache} from '@/components/reader/meaning-result-cache';
import {partitionMeaningWindow,intersectsReadingRect,type MeaningUnitRef} from '@/components/reader/meaning-window';
import type {ReadingFlow,ReadingWindowGeometry,ViewportRect} from '@/components/reader/reading-flow';
const empty:MeaningGroupStatus={pending:0,ready:0,failed:0,blocked:false,deferred:0,retryAt:null,prefetchPending:0,prefetchReady:0,pauseReason:null};
type Input={root:RefObject<HTMLDivElement|null>;documentId:string;userId:string;language:'en'|'es';enabled:boolean;ready:boolean;flow:ReadingFlow;theme:'light'|'dark'|'sepia';lowSaturation?:boolean;aiEpoch:string;budget:ReturnType<typeof createReaderAIClientBudget>;geometry:()=>ReadingWindowGeometry|null;subscribeGeometry:(refresh:()=>void)=>()=>void;locationFor?:(source:MeaningTextSource,range:Range)=>string|null};
type Unit={source:MeaningTextSource;range:Range;unit:MeaningUnitRef;doc:Document};
export function useMeaningGroupReading(input:Input){
 const current=useRef(input);current.current=input;
 const [state,setState]=useState({...empty,unsupported:false,skipped:0});
 const scope=JSON.stringify([input.userId,input.documentId,input.language,'sense-groups-v3-repair','offset-result-v1',input.aiEpoch]);
 const cacheRef=useRef({scope:'',values:createMeaningResultCache()});
 const controls=useRef({refresh:()=>{},retry:()=>{}});
 useEffect(()=>{
  if(cacheRef.current.scope!==scope)cacheRef.current={scope,values:createMeaningResultCache()};
  const mounted=input.root.current;if(!mounted)return;const container:HTMLDivElement=mounted;
  let disposed=false,raf=0,dirty=true,lastSignature='',direction:1|-1=1;
  let previous:{id:string;coordinate:number}|undefined,sourceId=0;
  const ids=new WeakMap<Element,number>(),sourceCache=new Map<Element,MeaningTextSource[]>(),unitCache=new WeakMap<MeaningTextSource,Unit[]|null>();
  type Watched={root:Element;observer:MutationObserver;projection?:TextProjection;projectionOff?:()=>void;off:()=>void};
  const docs=new Map<Document,Watched>(),prefixes=new Map<string,{owner:symbol;value?:MeaningGroupResult}>();
  const key=(text:string)=>scope+'\0'+text;
  const active=()=>current.current.enabled&&current.current.ready&&container.ownerDocument.visibilityState!=='hidden'&&navigator.onLine!==false;
  const notify=()=>{dirty=true;if(!disposed&&!raf)raf=window.requestAnimationFrame(()=>{raf=0;refresh();});};
  const exposures=createProcessedExposureQueue(async(units,signal)=>{const response=await fetch('/api/study/exposures',{method:'POST',headers:{'Content-Type':'application/json'},signal,body:JSON.stringify({documentId:input.documentId,sourceLanguage:input.language,units})});if(!response.ok)throw new Error('Exposure recording failed');});
  const queue=createMeaningGroupQueue({budget:input.budget,cache:cacheRef.current.values,changed:notify,request:async(text,signal)=>{
   const owner=Symbol(),id=key(text);prefixes.set(id,{owner});
   try{
    const response=await fetch('/api/meaning-groups',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/x-ndjson'},signal,body:JSON.stringify({documentId:input.documentId,sourceLanguage:input.language,text})});
    if(!response.ok)throw Object.assign(new Error('Meaning request failed'),{status:response.status,retryAfterMs:meaningRetryAfterMs(response.headers.get('Retry-After'))});
    const value=await consumeAIStream<MeaningGroupResult>(response,signal,event=>{
     if(!signal.aborted&&prefixes.get(id)?.owner===owner&&event.type==='unit'){
      const prefix=validateMeaningGroupPrefix(text,event.value);if(event.index!==prefix.groups.length-1)throw new AIStreamError('INVALID_OUTPUT','');prefixes.set(id,{owner,value:prefix});notify();
     }
    });signal.throwIfAborted();return validateMeaningGroupResult(text,value);
   }catch(error){
    if(error instanceof AIStreamError&&error.code==='RATE_LIMITED')throw Object.assign(error,{status:429});
    if(error instanceof AIStreamError&&['UNAVAILABLE','STREAM_UNSUPPORTED'].includes(error.code))throw Object.assign(error,{status:503});throw error;
   }finally{if(prefixes.get(id)?.owner===owner)prefixes.delete(id);notify();}
  }});
  function watch(doc:Document,within:Element){
   let watched=docs.get(doc);
   if(watched?.root!==within){
    if(watched){watched.observer.disconnect();watched.off();watched.projectionOff?.();}
    const observer=new doc.defaultView!.MutationObserver(records=>{
     if(records.some(record=>!(record.type==='characterData'&&projectionFor(record.target))))sourceCache.delete(within);
     notify();
    });observer.observe(within,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['hidden','aria-hidden','class','style','role','epub:type']});
    doc.addEventListener('scroll',notify,true);doc.defaultView!.addEventListener('resize',notify);doc.defaultView!.addEventListener('load',notify);
    watched={root:within,observer,off:()=>{doc.removeEventListener('scroll',notify,true);doc.defaultView?.removeEventListener('resize',notify);doc.defaultView?.removeEventListener('load',notify);}};docs.set(doc,watched);
   }
   const projection=projectionFor(within);
   if(projection!==watched.projection){watched.projectionOff?.();watched.projection=projection;watched.projectionOff=projection?.subscribe(notify);sourceCache.delete(within);}
  }
  function refresh(){
   if(disposed)return;
   const on=active();queue.setSuspended(!on);exposures.setSuspended(!on);
   if(!on){if(!current.current.enabled){for(const doc of docs.keys())clearMeaningHighlights(doc);setState(old=>JSON.stringify(old)===JSON.stringify({...empty,unsupported:false,skipped:0})?old:{...empty,unsupported:false,skipped:0});}return;}
   const body=container.querySelector<HTMLElement>('[data-reading-body]'),g=current.current.geometry();if(!body||!g)return;
   const roots:Array<{doc:Document;within:Element;offset:{left:number;top:number};bounds?:ViewportRect}>=[];
   if(body.querySelector('[data-pdf-selection-key]'))roots.push({doc:container.ownerDocument,within:body,offset:{left:0,top:0}});
   for(const iframe of body.querySelectorAll('iframe'))try{const doc=iframe.contentDocument,r=iframe.getBoundingClientRect();if(doc?.body&&r.right>r.left&&r.bottom>r.top&&intersectsReadingRect(r,g.neighborhood))roots.push({doc,within:doc.body,offset:{left:r.left,top:r.top},bounds:r});}catch{/* Non-book frames are not analysis sources. */}
   const live=new Set(roots.map(r=>r.doc));for(const [doc,watched] of docs)if(!live.has(doc)){watched.observer.disconnect();watched.off();watched.projectionOff?.();sourceCache.delete(watched.root);clearMeaningHighlights(doc);docs.delete(doc);dirty=true;}
   const candidates:Array<{unit:MeaningUnitRef;rects:ViewportRect[]}>=[],entries=new Map<string,Unit>();let unsupported=false,skipped=0;
   for(const frame of roots){
    watch(frame.doc,frame.within);let passages=sourceCache.get(frame.within);if(!passages){passages=collectMeaningSources(frame.within);sourceCache.set(frame.within,passages);}
    for(const source of passages){
     let units=unitCache.get(source);
     if(units===undefined){try{if(!ids.has(source.element))ids.set(source.element,sourceId++);units=splitMeaningText(source.text,1200,input.language).map(u=>{const range=sourceRange(source,u.start,u.end);return {source,range,doc:frame.doc,unit:{key:key(u.text),text:u.text,sourceId:`${ids.get(source.element)}:${u.start}`,location:current.current.locationFor?.(source,range)??null,start:u.start,end:u.end}};});}catch{units=null;}unitCache.set(source,units);}
     if(!units){skipped++;continue;}
     for(const entry of units){
      const rects=projectedRanges(entry.range).flatMap(range=>Array.from(range.getClientRects())).filter(r=>r.width>0&&r.height>0).map(r=>({left:r.left+frame.offset.left,right:r.right+frame.offset.left,top:r.top+frame.offset.top,bottom:r.bottom+frame.offset.top})).filter(r=>!frame.bounds||intersectsReadingRect(r,frame.bounds));
      if(!rects.some(r=>intersectsReadingRect(r,g.neighborhood)))continue;
      if(!supportsMeaningHighlights(frame.doc)){unsupported=true;continue;}
      candidates.push({unit:entry.unit,rects});entries.set(entry.unit.sourceId,entry);
     }
    }
   }
   if(previous){const candidate=candidates.find(c=>c.unit.sourceId===previous!.id),coordinate=candidate?.rects[0]?.[g.axis==='horizontal'?'left':'top'];if(coordinate!==undefined&&Math.abs(coordinate-previous.coordinate)>1)direction=coordinate<previous.coordinate?1:-1;}
   const w=partitionMeaningWindow(candidates,g,direction),first=w.visible[0];if(first){const candidate=candidates.find(c=>c.unit.sourceId===first.sourceId)!;previous={id:first.sourceId,coordinate:candidate.rects[0][g.axis==='horizontal'?'left':'top']};}
   queue.setWindow(w);
   for(const unit of w.visible)if(unit.location&&queue.get(unit.key))exposures.add({location:unit.location,sourceText:unit.text});
   const all=[...w.visible,...w.neighborhood.map(n=>n.unit)],signature=JSON.stringify(all.map(u=>[u.sourceId,u.key,Boolean(queue.get(u.key)),prefixes.get(u.key)?.value?.groups.length??0]));
   if(dirty||signature!==lastSignature){
    for(const doc of docs.keys())paintMeaningHighlights(doc,all.flatMap(unit=>{const entry=entries.get(unit.sourceId),result=queue.get(unit.key)??prefixes.get(unit.key)?.value;return entry?.doc===doc&&result?[{source:entry.source,result,offset:unit.start}]:[];}),current.current.theme,current.current.lowSaturation);
    dirty=false;lastSignature=signature;
   }
   const next={...queue.status(),unsupported,skipped};setState(old=>JSON.stringify(old)===JSON.stringify(next)?old:next);
  }
  controls.current={refresh:()=>{dirty=true;refresh();},retry:()=>queue.retry()};
  const unsubscribe=input.subscribeGeometry(notify);
  container.addEventListener('scroll',notify,true);container.addEventListener('load',notify,true);window.addEventListener('resize',notify);window.addEventListener('online',notify);window.addEventListener('offline',notify);container.ownerDocument.addEventListener('visibilitychange',notify);
  refresh();const timer=window.setInterval(refresh,400);
  return()=>{disposed=true;window.clearInterval(timer);window.cancelAnimationFrame(raf);unsubscribe();container.removeEventListener('scroll',notify,true);container.removeEventListener('load',notify,true);window.removeEventListener('resize',notify);window.removeEventListener('online',notify);window.removeEventListener('offline',notify);container.ownerDocument.removeEventListener('visibilitychange',notify);queue.dispose();exposures.dispose();controls.current={refresh:()=>{},retry:()=>{}};for(const [doc,watched] of docs){watched.observer.disconnect();watched.off();watched.projectionOff?.();clearMeaningHighlights(doc);}};
 },[scope,input.root,input.budget]);
 useEffect(()=>controls.current.refresh(),[input.enabled,input.ready,input.flow,input.theme,input.lowSaturation]);
 return {...state,retry:()=>controls.current.retry()};
}
