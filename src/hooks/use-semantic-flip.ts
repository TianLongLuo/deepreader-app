'use client';
import {useEffect,useRef,useState} from 'react';
import {consumeAIStream} from '@/lib/ai-stream';
import {validateSemanticReplacement,type SemanticFlipInput,type SemanticFlipResult} from '@/lib/semantic-flip';
import {createSemanticFlipController,type CompletedFlip,type FlipSessionDomain} from '@/components/reader/semantic-flip-controller';
import type {Occurrence} from '@/components/reader/source-position';
import type {createReaderAIClientBudget} from '@/components/reader/reader-ai-budget';
import {meaningRetryAfterMs} from '@/components/reader/meaning-group-queue';
type Input={enabled:boolean;ready:boolean;domain:FlipSessionDomain;budget:ReturnType<typeof createReaderAIClientBudget>;inputFor:(o:Occurrence)=>SemanticFlipInput;apply:(o:Occurrence,replacement:string)=>Promise<void>;restore:(id:string,animate?:boolean)=>Promise<void>;restoreAll:()=>Promise<void>;pending?:(o:Occurrence)=>()=>void;isVisible?:(c:CompletedFlip)=>boolean};
export function useSemanticFlip(input:Input){
 const latest=useRef(input);latest.current=input;const controller=useRef<ReturnType<typeof createSemanticFlipController>|null>(null),retryAction=useRef(()=>{});
 const [state,setState]=useState({pending:0,message:'',lastChange:null as {original:string;replacement:string}|null});
 const key=JSON.stringify(input.domain);
 useEffect(()=>{
  let alive=true,timer:ReturnType<typeof setTimeout>|undefined,release:(()=>void)|undefined,rounds=0,waited=0,reason:''|'rate'|'configuration'|'exhausted'='';
  const changed=()=>{if(alive&&controller.current===current)setState(current.status());};
  const pause=(status:number,retryAfter?:number)=>{
   if(reason==='configuration'||(reason&&status===429))return;
   clearTimeout(timer);const old=release;
   if(status!==429){reason='configuration';release=input.budget.pause(reason);old?.();return;}
   const delay=retryAfter??[5000,15000,45000][rounds]??45000;
   if(rounds>=3||waited+delay>180000){reason='exhausted';release=input.budget.pause('rate');old?.();return;}
   reason='rate';rounds++;waited+=delay;release=input.budget.pause('rate',Date.now()+delay);old?.();
   timer=setTimeout(()=>{reason='';release?.();release=undefined;},delay);
  };
  const current=createSemanticFlipController({domain:input.domain,budget:input.budget,changed,
   inputFor:o=>latest.current.inputFor(o),apply:(o,r)=>latest.current.apply(o,r),restore:(id,animate)=>latest.current.restore(id,animate),pending:input.pending,restoreAll:()=>latest.current.restoreAll(),isVisible:c=>latest.current.isVisible?.(c)??false,
   request:async(value,signal)=>{
    try{
     const response=await fetch('/api/semantic-flip',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/x-ndjson'},body:JSON.stringify(value),signal});
     if(!response.ok){if([401,403,429,503].includes(response.status))pause(response.status,meaningRetryAfterMs(response.headers.get('retry-after')));throw Object.assign(new Error('翻牌未完成'),{status:response.status});}
     const result=await consumeAIStream<SemanticFlipResult>(response,signal,()=>{});
     return {...result,replacement:validateSemanticReplacement({replacement:result?.replacement})};
    }catch(error){if((error as {code?:string}).code==='RATE_LIMITED')pause(429);throw error;}
   }});
  controller.current=current;current.setSuspended(!latest.current.enabled||!latest.current.ready);setState(current.status());
  // Source restore precedes the new domain's first paid action. No old async cleanup invokes new callbacks.
  void latest.current.restoreAll();
  retryAction.current=()=>{clearTimeout(timer);reason='';rounds=0;waited=0;release?.();release=undefined;input.budget.resume();setState({...current.status(),message:'请重新点击原词重试'});};
  return()=>{alive=false;clearTimeout(timer);current.dispose();release?.();if(controller.current===current)controller.current=null;};
 },[key,input.budget]);
 const enabledBefore=useRef(input.enabled);
 useEffect(()=>{const current=controller.current;if(enabledBefore.current&&!input.enabled)void current?.reset(input.domain);enabledBefore.current=input.enabled;current?.setSuspended(!input.enabled||!input.ready);},[input.enabled,input.ready,key]);
 const actions=useRef({click:(o:Occurrence,options?:{animate?:boolean})=>{if(latest.current.enabled&&latest.current.ready)controller.current?.click(o,options);},restoreOccurrence:(id:string)=>{if(latest.current.enabled&&latest.current.ready)controller.current?.restoreOccurrence(id);},escape:(id?:string)=>controller.current?.escape(id),completed:()=>controller.current?.completed()??[],rebind:async(bind:(c:CompletedFlip)=>Promise<void>)=>{await controller.current?.rebind(bind);},retry:()=>retryAction.current()});
 return {...actions.current,...state};
}
