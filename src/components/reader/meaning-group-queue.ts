import {validateMeaningGroupResult,type MeaningGroupResult} from '@/lib/meaning-groups';
import type {createReaderAIClientBudget,ReaderAITicket,ReaderAIKind} from './reader-ai-budget';
import type {createMeaningResultCache} from './meaning-result-cache';
import type {MeaningUnitRef,MeaningWindowSnapshot} from './meaning-window';
export type MeaningGroupStatus={pending:number;ready:number;failed:number;blocked:boolean;deferred:number;retryAt:number|null;prefetchPending:number;prefetchReady:number;pauseReason:null|'rate'|'exhausted'|'configuration'};
export function meaningRetryAfterMs(value:string|null,now=Date.now()):number|undefined{
 if(!value?.trim())return undefined;const seconds=Number(value),ms=Number.isFinite(seconds)?seconds*1000:Date.parse(value)-now;
 return Number.isFinite(ms)?Math.min(120000,Math.max(1000,ms)):undefined;
}
type Classified={unit:MeaningUnitRef;kind:ReaderAIKind;rank:number};
let queueId=0;
export function createMeaningGroupQueue(options:{request:(text:string,s:AbortSignal)=>Promise<MeaningGroupResult>;changed:()=>void;budget:ReturnType<typeof createReaderAIClientBudget>;cache:ReturnType<typeof createMeaningResultCache>;neighborMaxUnits?:number;neighborMaxChars?:number}){
 const {request,changed,budget,cache}=options,prefix=`meaning:${queueId++}:`,maxUnits=options.neighborMaxUnits??16,maxChars=options.neighborMaxChars??19200;
 let window:MeaningWindowSnapshot={visible:[],neighborhood:[],readingDirection:1},current=new Map<string,Classified>(),suspended=false,disposed=false,refilling=false;
 let pauseReason:MeaningGroupStatus['pauseReason']=null,retryAt:number|null=null,rounds=0,waited=0,timer:ReturnType<typeof setTimeout>|undefined;
 let releasePause:(()=>void)|undefined;
 const errors=new Set<string>(),flights=new Map<string,{ticket:ReaderAITicket<MeaningGroupResult>;kind:ReaderAIKind;rank:number;text:string}>();
 const rank=(distance:1|2,direction:1|-1)=>distance===1?(direction===window.readingDirection?1:2):(direction===window.readingDirection?3:4);
 const stopTimer=()=>{clearTimeout(timer);timer=undefined;retryAt=null;};
 function classify(){
  current=new Map();for(const unit of window.visible)current.set(unit.key,{unit,kind:'meaning-visible',rank:0});
  for(const n of [...window.neighborhood].sort((a,b)=>rank(a.distance,a.direction)-rank(b.distance,b.direction))){if(!current.has(n.unit.key))current.set(n.unit.key,{unit:n.unit,kind:'meaning-prefetch',rank:rank(n.distance,n.direction)});}
 }
 function pause(error:{status?:number;retryAfterMs?:number}){
  if(error.status!==429){stopTimer();pauseReason='configuration';const release=budget.pause('configuration');releasePause?.();releasePause=release;return;}
  if(pauseReason)return; // Concurrent failures share one recovery epoch.
  const supplied=error.retryAfterMs,delay=typeof supplied==='number'&&Number.isFinite(supplied)?Math.min(120000,Math.max(1000,supplied)):[5000,15000,45000][rounds]??45000;
  if(rounds>=3||waited+delay>180000){pauseReason='exhausted';releasePause=budget.pause('rate');return;}
  rounds++;waited+=delay;pauseReason='rate';retryAt=Date.now()+delay;releasePause=budget.pause('rate',retryAt);
  timer=setTimeout(()=>{timer=undefined;retryAt=null;if(disposed)return;pauseReason=null;releasePause?.();releasePause=undefined;refill();changed();},delay);
 }
 function refill(){
  if(disposed||suspended||refilling)return;refilling=true;
  try{
   const updates:Array<{id:string;kind:ReaderAIKind;rank:number}>=[];
   for(const [key,flight] of flights){const value=current.get(key);if(value){flight.kind=value.kind;flight.rank=value.rank;updates.push({id:flight.ticket.id,kind:value.kind,rank:value.rank});}}
   budget.updateMany(updates);
   for(const [key,flight] of flights)if(!current.has(key)){flights.delete(key);flight.ticket.cancel();}
   let neighbors=0,chars=0;
   for(const [key,flight] of [...flights].filter(([,f])=>f.kind==='meaning-prefetch').sort((a,b)=>a[1].rank-b[1].rank)){
    if(neighbors>=maxUnits||chars+flight.text.length>maxChars){flights.delete(key);flight.ticket.cancel();continue;}
    neighbors++;chars+=flight.text.length;
   }
   for(const [key,value] of current){
    if(flights.has(key)||errors.has(key)||cache.get(key))continue;
    const pure=value.kind==='meaning-prefetch';if(pure&&(neighbors>=maxUnits||chars+value.unit.text.length>maxChars))continue;
    if(pure){neighbors++;chars+=value.unit.text.length;}
    const text=value.unit.text;
    const ticket=budget.submit({id:prefix+key,kind:value.kind,rank:value.rank,run:signal=>{signal.throwIfAborted();if(disposed||suspended||!current.has(key))throw new DOMException('Departed unit','AbortError');return request(text,signal);}});
    const flight={ticket,kind:value.kind,rank:value.rank,text};flights.set(key,flight);
    void ticket.result.then(result=>{if(disposed||suspended||flights.get(key)!==flight||!current.has(key))return;cache.set(key,text,validateMeaningGroupResult(text,result));},error=>{
     if(disposed||suspended||flights.get(key)!==flight||(error instanceof Error&&error.name==='AbortError'))return;
     if([401,403,429,503].includes(error?.status)){pause(error);return;}errors.add(key);
    }).catch(()=>{if(!disposed&&flights.get(key)===flight)errors.add(key);}).finally(()=>{if(flights.get(key)!==flight)return;flights.delete(key);if(!disposed){refill();changed();}});
   }
  }finally{refilling=false;}
 }
 return {
  setWindow(value:MeaningWindowSnapshot){if(disposed)return;window=value;classify();for(const key of errors)if(!current.has(key))errors.delete(key);refill();},
  /** Temporary compatibility for the existing hook; no legacy rate-history reset. */
  setVisible(texts:string[]){this.setWindow({visible:texts.map(text=>({key:text,text,sourceId:text,location:null,start:0,end:text.length})),neighborhood:[],readingDirection:1});},
  setSuspended(value:boolean){if(disposed||value===suspended)return;suspended=value;if(value){for(const flight of flights.values())flight.ticket.cancel();flights.clear();}else refill();changed();},
  get:(key:string)=>cache.get(key),
  status():MeaningGroupStatus{
   const visible=window.visible,neighborKeys=new Set([...current].filter(([,v])=>v.kind==='meaning-prefetch').map(([key])=>key));
   const pending=visible.filter(u=>!cache.get(u.key)&&!errors.has(u.key)).length,ready=visible.filter(u=>cache.get(u.key)).length,failed=visible.filter(u=>errors.has(u.key)).length;
   const prefetchPending=[...flights].filter(([key])=>neighborKeys.has(key)).length,prefetchReady=[...neighborKeys].filter(key=>cache.get(key)).length;
   const unadmitted=[...current].filter(([key])=>!cache.get(key)&&!errors.has(key)&&!flights.has(key)).length;
   const activeVisible=[...flights].filter(([,f])=>f.kind==='meaning-visible').length;
   return {pending,ready,failed,blocked:pauseReason!==null,deferred:unadmitted+(pauseReason?activeVisible:0),retryAt,prefetchPending,prefetchReady,pauseReason};
  },
  retry(){if(disposed)return;stopTimer();rounds=0;waited=0;errors.clear();pauseReason=null;releasePause?.();releasePause=undefined;budget.resume();refill();changed();},
  dispose(){if(disposed)return;disposed=true;stopTimer();for(const flight of flights.values())flight.ticket.cancel();flights.clear();releasePause?.();releasePause=undefined;current.clear();window={visible:[],neighborhood:[],readingDirection:1};},
 };
}
