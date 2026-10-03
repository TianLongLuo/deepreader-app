export type ReaderAIKind='semantic-flip'|'meaning-visible'|'meaning-prefetch';
export type ReaderAITicket<T>={id:string;result:Promise<T>;cancel(reason?:unknown):void};
type Update={id:string;kind:ReaderAIKind;rank:number};
type Job=Update&{order:number;controller:AbortController;run:(signal:AbortSignal)=>Promise<unknown>;resolve:(value:unknown)=>void;reject:(error:unknown)=>void};
const priority=(kind:ReaderAIKind)=>kind==='semantic-flip'?0:kind==='meaning-visible'?1:2;
const aborted=()=>new DOMException('Reading request canceled','AbortError');
/** UI ownership is independent of late settlement by non-cooperative transports. */
export function createReaderAIClientBudget(options:{maxActive?:number;maxPrefetchActive?:number;maxPrefetchStartsPerMinute?:number;now?:()=>number}={}){
 const maxActive=Math.max(1,options.maxActive??2),maxPrefetchActive=Math.max(1,options.maxPrefetchActive??1),maxStarts=Math.max(1,options.maxPrefetchStartsPerMinute??8),now=options.now??Date.now;
 const holds=new Set<symbol>();
 const active=new Map<string,Job>(),queued=new Map<string,Job>(),starts:number[]=[];
 let order=0,paused=false,disposed=false,timer:ReturnType<typeof setTimeout>|undefined,pumping=false;
 const prune=()=>{while(starts.length&&starts[0]+60000<=now())starts.shift();};
 const sorted=()=>Array.from(queued.values()).sort((a,b)=>priority(a.kind)-priority(b.kind)||a.rank-b.rank||a.order-b.order);
 const pure=()=>Array.from(active.values()).filter(job=>job.kind==='meaning-prefetch');
 function remove(job:Job,reason:unknown){
  if(active.get(job.id)===job)active.delete(job.id);else if(queued.get(job.id)===job)queued.delete(job.id);else return;
  job.controller.abort(reason);job.reject(reason);
 }
 function pump(){
  if(pumping)return;pumping=true;clearTimeout(timer);timer=undefined;
  try{
   if(disposed||paused)return;prune();
   const excess=pure().sort((a,b)=>b.rank-a.rank||b.order-a.order);
   while(excess.length>maxPrefetchActive)remove(excess.shift()!,aborted());
   while(true){
    const jobs=sorted();if(!jobs.length)break;
    const foreground=jobs.find(job=>job.kind!=='meaning-prefetch');
    if(active.size>=maxActive){if(foreground){const victim=pure().sort((a,b)=>b.rank-a.rank||b.order-a.order)[0];if(victim){remove(victim,aborted());continue;}}break;}
    const job=foreground??(pure().length<maxPrefetchActive&&starts.length<maxStarts?jobs[0]:undefined);if(!job)break;
    queued.delete(job.id);active.set(job.id,job);if(job.kind==='meaning-prefetch')starts.push(now());
    let work:Promise<unknown>;try{work=Promise.resolve(job.run(job.controller.signal));}catch(error){work=Promise.reject(error);}
    void work.then(value=>{if(active.get(job.id)!==job)return;active.delete(job.id);job.resolve(value);queueMicrotask(pump);},error=>{if(active.get(job.id)!==job)return;active.delete(job.id);job.reject(error);queueMicrotask(pump);});
   }
   if(Array.from(queued.values()).some(job=>job.kind==='meaning-prefetch')&&starts.length>=maxStarts){timer=setTimeout(pump,Math.max(1,starts[0]+60000-now()));}
  }finally{pumping=false;}
 }
 return {
  submit<T>(request:Update&{run:(signal:AbortSignal)=>Promise<T>}):ReaderAITicket<T>{
   const old=active.get(request.id)??queued.get(request.id);if(old)remove(old,aborted());
   let resolve!:(value:T)=>void,reject!:(error:unknown)=>void;
   const result=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});void result.catch(()=>{});
   const job:Job={...request,order:order++,controller:new AbortController(),resolve:value=>resolve(value as T),reject};
   if(disposed){job.controller.abort();reject(aborted());}else{queued.set(job.id,job);pump();}
   return {id:job.id,result,cancel(reason){remove(job,reason??aborted());pump();}};
  },
  updateMany(updates:readonly Update[]){for(const update of updates){const job=active.get(update.id)??queued.get(update.id);if(job){job.kind=update.kind;job.rank=update.rank;}}pump();},
  // The window owner controls finite rate recovery; this gate never resets its history.
  pause(_reason:'rate'|'configuration',_retryAt?:number){const token=Symbol();holds.add(token);paused=true;clearTimeout(timer);timer=undefined;return()=>{if(!holds.delete(token))return;paused=holds.size>0;if(!paused)queueMicrotask(pump);};},
  resume(){if(disposed)return;holds.clear();paused=false;pump();},
  status(){prune();return {active:active.size,prefetchActive:pure().length,queued:queued.size,paused,prefetchRetryAt:starts.length>=maxStarts&&Array.from(queued.values()).some(job=>job.kind==='meaning-prefetch')?starts[0]+60000:null};},
  dispose(){if(disposed)return;disposed=true;holds.clear();clearTimeout(timer);timer=undefined;for(const job of [...active.values(),...queued.values()])remove(job,aborted());},
 };
}
