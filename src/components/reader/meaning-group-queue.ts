import type {MeaningGroupResult} from '@/lib/meaning-groups';
export type MeaningGroupStatus={pending:number;ready:number;failed:number;blocked:boolean;deferred:number;retryAt:number|null};
type Request=(text:string,signal:AbortSignal)=>Promise<MeaningGroupResult>;
/** Parse seconds or an HTTP date; untrusted headers never produce unbounded timers. */
export function meaningRetryAfterMs(value:string|null,now=Date.now()):number|undefined{
 if(!value?.trim())return undefined;
 const seconds=Number(value),ms=Number.isFinite(seconds)?seconds*1000:Date.parse(value)-now;
 return Number.isFinite(ms)?Math.min(120000,Math.max(1000,ms)):undefined;
}
/** Session-scoped, two-slot fair queue. Only validated successes enter the cache. */
export function createMeaningGroupQueue(request:Request,changed:()=>void,cache=new Map<string,MeaningGroupResult>()){
 let visible=new Set<string>(),disposed=false,blocked=false,rounds=0,retryAt:number|null=null;
 let timer:ReturnType<typeof setTimeout>|undefined;
 const errors=new Set<string>(),flights=new Map<string,AbortController>();
 const stopTimer=()=>{clearTimeout(timer);timer=undefined;retryAt=null;};
 const prune=()=>{for(const collection of [cache,errors])while(collection.size>128){const key=[...collection.keys()].find(k=>!visible.has(k));if(key===undefined)break;collection.delete(key);}};
 const pump=()=>{
  if(disposed||blocked)return;
  for(const text of visible){
   if(flights.size>=2)break;
   if(cache.has(text)||errors.has(text)||flights.has(text))continue;
   const controller=new AbortController();flights.set(text,controller);
   Promise.resolve().then(()=>{controller.signal.throwIfAborted();return request(text,controller.signal);}).then(result=>{
    if(!disposed&&!controller.signal.aborted&&visible.has(text)){cache.set(text,result);prune();}
   }).catch(error=>{
    if(disposed||controller.signal.aborted)return;
    if([401,403,429,503].includes(error?.status)){
     blocked=true;for(const other of flights.values())if(other!==controller)other.abort();
     if(error.status===429&&rounds<3){
      const supplied=error.retryAfterMs;
      const delay=typeof supplied==='number'&&Number.isFinite(supplied)?Math.min(120000,Math.max(1000,supplied)):[5000,15000,45000][rounds];
      rounds++;retryAt=Date.now()+delay;
      timer=setTimeout(()=>{timer=undefined;retryAt=null;blocked=false;pump();changed();},delay);
      return;
     }
    }
    errors.add(text);prune();
   }).finally(()=>{if(flights.get(text)===controller)flights.delete(text);if(!disposed){pump();changed();}});
  }
 };
 return {
  setVisible(texts:string[]){
   if(disposed)return;
   const next=new Set(texts),different=next.size!==visible.size||[...next].some(t=>!visible.has(t));
   if(different)rounds=0;
   visible=next;
   for(const [text,c] of flights)if(!visible.has(text))c.abort();
   if(!visible.size&&retryAt!==null){stopTimer();blocked=false;}
   prune();pump();
  },
  get:(text:string)=>cache.get(text),
  status():MeaningGroupStatus{
   const pending=[...visible].filter(t=>!cache.has(t)&&!errors.has(t)).length;
   const active=[...flights].filter(([t,c])=>visible.has(t)&&!c.signal.aborted).length;
   return {pending,ready:[...visible].filter(t=>cache.has(t)).length,failed:[...visible].filter(t=>errors.has(t)).length,blocked,deferred:blocked?Math.max(0,pending-active):0,retryAt};
  },
  retry(){if(disposed)return;stopTimer();rounds=0;errors.clear();blocked=false;pump();changed();},
  dispose(){disposed=true;stopTimer();for(const controller of flights.values())controller.abort();visible.clear();},
 };
}
