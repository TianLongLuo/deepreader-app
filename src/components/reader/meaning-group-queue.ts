import type {MeaningGroupResult} from '@/lib/meaning-groups';
export type MeaningGroupStatus={pending:number;ready:number;failed:number;blocked:boolean};
type Request=(text:string,signal:AbortSignal)=>Promise<MeaningGroupResult>;
/** Session-scoped queue: successful results survive toggles; failures require explicit retry. */
export function createMeaningGroupQueue(request:Request,changed:()=>void,cache=new Map<string,MeaningGroupResult>()){
 let visible=new Set<string>(),disposed=false,blocked=false;
 const errors=new Set<string>(),flights=new Map<string,AbortController>();
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
    errors.add(text);prune();
    if([401,403,429,503].includes(error?.status)){blocked=true;for(const other of flights.values())if(other!==controller)other.abort();}
   }).finally(()=>{flights.delete(text);if(!disposed){pump();changed();}});
  }
 };
 return {
  setVisible(texts:string[]){if(disposed)return;visible=new Set(texts.slice(0,32));for(const [text,c] of flights)if(!visible.has(text))c.abort();pump();},
  get:(text:string)=>cache.get(text),
  status():MeaningGroupStatus{return {pending:blocked?0:[...visible].filter(t=>!cache.has(t)&&!errors.has(t)).length,ready:[...visible].filter(t=>cache.has(t)).length,failed:[...visible].filter(t=>errors.has(t)).length,blocked};},
  retry(){errors.clear();blocked=false;pump();changed();},
  dispose(){disposed=true;for(const controller of flights.values())controller.abort();visible.clear();},
 };
}
