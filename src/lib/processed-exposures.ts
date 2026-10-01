export type ProcessedExposure={location:string;sourceText:string};
/** Validated analysis transitions enqueue evidence, independently of text painting. */
export function createProcessedExposureQueue(send:(items:ProcessedExposure[],signal:AbortSignal)=>Promise<void>){
 const saved=new Set<string>(),pending=new Map<string,{item:ProcessedExposure;attempts:number}>(),abort=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined,busy=false;
 const key=(item:ProcessedExposure)=>JSON.stringify([item.location,item.sourceText]);
 const remember=(id:string)=>{if(saved.size>=4096)saved.delete(saved.values().next().value!);saved.add(id);};
 const schedule=(ms=100)=>{if(!timer&&!busy&&!abort.signal.aborted)timer=setTimeout(()=>{timer=undefined;void flush();},ms);};
 async function flush(){
  if(busy||abort.signal.aborted||!pending.size)return;busy=true;const batch=Array.from(pending.entries()).slice(0,8);let retry=false;
  try{await send(batch.map(([,value])=>value.item),abort.signal);for(const [id] of batch){pending.delete(id);remember(id);}}
  catch{if(!abort.signal.aborted){retry=true;for(const [id,value] of batch){if(++value.attempts>=3){pending.delete(id);remember(id);}}}}
  finally{busy=false;if(pending.size)schedule(retry?10000:100);}
 }
 return {add(item:ProcessedExposure){if(abort.signal.aborted||!item.location||item.location.length>1000||item.sourceText.length>1200)return;const id=key(item);if(saved.has(id)||pending.has(id)||pending.size>=128)return;pending.set(id,{item,attempts:0});schedule();},dispose(){abort.abort();clearTimeout(timer);pending.clear();}};
}
