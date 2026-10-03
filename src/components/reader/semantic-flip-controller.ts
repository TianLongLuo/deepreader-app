import {validateSemanticReplacement,type SemanticFlipInput,type SemanticFlipResult} from '@/lib/semantic-flip';
import type {Occurrence,SourcePosition} from './source-position';
import type {createReaderAIClientBudget,ReaderAITicket} from './reader-ai-budget';
export type FlipSessionDomain={documentId:string;sourceLanguage:'en'|'es';targetLanguage:'en'|'zh'|'es';aiEpoch:string};
export type CompletedFlip={id:string;position:SourcePosition;word:string;replacement:string};
type Options={domain:FlipSessionDomain;budget:ReturnType<typeof createReaderAIClientBudget>;request:(input:SemanticFlipInput,signal:AbortSignal)=>Promise<SemanticFlipResult>;inputFor:(o:Occurrence)=>SemanticFlipInput;apply:(o:Occurrence,replacement:string)=>Promise<void>;restore:(id:string,animate?:boolean)=>Promise<void>;restoreAll:()=>Promise<void>;changed:()=>void;pending?:(o:Occurrence)=>()=>void;isVisible?:(c:CompletedFlip)=>boolean};
export function createSemanticFlipController(options:Options){
 let domain={...options.domain},generation=0,disposed=false,suspended=false,message='',lastChange:{original:string;replacement:string}|null=null,serial=Promise.resolve();
 const records=new Map<string,CompletedFlip>(),jobs=new Map<string,{ticket:ReaderAITicket<SemanticFlipResult>;applying:boolean;generation:number;clear?:()=>void}>();
 const notify=()=>{if(!disposed)options.changed();},snapshot=(c:CompletedFlip):CompletedFlip=>({...c,position:{...c.position}});
 const clear=(job:{clear?:()=>void})=>{const off=job.clear;job.clear=undefined;try{off?.();}catch{/* Visual feedback never interrupts request cleanup. */}};
 const cancel=(id:string)=>{const job=jobs.get(id);if(!job)return;jobs.delete(id);job.ticket.cancel();clear(job);};
 const work=(run:()=>Promise<void>)=>{const operation=serial.then(run);serial=operation.catch(()=>{});return operation;};
 const visible=(c:CompletedFlip)=>options.isVisible?.(c)??false;
 const failure=(error:unknown)=>{const e=error as {code?:string;status?:number};return e?.code==='RATE_LIMITED'||e?.status===429?'额度繁忙，请稍后重试':[401,403,503].includes(e?.status??0)?'请检查 AI 设置后重试':'本次翻牌未完成，原文保持不变，请重试';};
 function restoreOccurrence(id:string,{animate=false}:{animate?:boolean}={}){
  cancel(id);if(!records.has(id)){message='';notify();return;}
  records.delete(id);lastChange=null;const started=generation;message='正在恢复原词…';notify();
  void work(async()=>{if(disposed||started!==generation)return;await (animate?options.restore(id,true):options.restore(id));if(started===generation&&!disposed){message='已恢复原词';notify();}}).catch(()=>{if(started===generation&&!disposed){message='原词恢复未完成，请重试';notify();}});
 }
 return {
  click(o:Occurrence,{animate=true}:{animate?:boolean}={}){
   if(disposed||suspended)return;
   if(records.has(o.id)){restoreOccurrence(o.id,{animate});return;}
   if(jobs.has(o.id)){cancel(o.id);message='已取消';notify();return;}
   if(options.budget.status().paused){message='阅读 AI 已暂停，请重试后重新点击原词';notify();return;}
   if(records.size>=256&&![...records.values()].some(c=>!visible(c))){message='本次翻牌已达上限，请先恢复一些单词';notify();return;}
   if(jobs.size>=2){const oldest=[...jobs].find(([,job])=>!job.applying);if(oldest)cancel(oldest[0]);else return;}
   const started=generation,key=JSON.stringify(domain);let input:SemanticFlipInput;
   try{input=options.inputFor(o);}catch{message='未找到完整原词，请重试';notify();return;}
   const ticket=options.budget.submit({id:`flip:${key}:${o.id}`,kind:'semantic-flip',rank:0,run:signal=>options.request(input,signal)}),job:{ticket:ReaderAITicket<SemanticFlipResult>;applying:boolean;generation:number;clear?:()=>void}={ticket,applying:false,generation:started};jobs.set(o.id,job);if(animate){try{job.clear=options.pending?.(o);}catch{/* Keep reading when a view is being removed. */}}message='正在理解语境…';notify();
   void ticket.result.then(async result=>{
    if(disposed||started!==generation||suspended||jobs.get(o.id)!==job)return;
    const replacement=validateSemanticReplacement({replacement:result.replacement});
    if(replacement===o.word){message='已是简明表达';return;}
    await work(async()=>{
     if(disposed||started!==generation||suspended||jobs.get(o.id)!==job)return;
     job.applying=true;
     if(records.size>=256){const victim=[...records.values()].find(c=>!visible(c));if(!victim){message='本次翻牌已达上限，请先恢复一些单词';return;}records.delete(victim.id);await options.restore(victim.id);if(disposed||started!==generation)return;}
     const record:CompletedFlip={id:o.id,position:{...o.position},word:o.word,replacement};records.set(o.id,record);
     try{await options.apply(o,replacement);}catch(error){records.delete(o.id);if(started===generation&&!disposed)await options.restore(o.id).catch(()=>{});throw error;}
     if(disposed||started!==generation)return;
     lastChange={original:o.word,replacement};message='';notify();
    });
   }).catch(error=>{if(disposed||started!==generation||jobs.get(o.id)!==job||(error instanceof Error&&error.name==='AbortError'))return;message=failure(error);notify();}).finally(()=>{if(jobs.get(o.id)===job){jobs.delete(o.id);clear(job);notify();}});
  },
  restoreOccurrence,
  escape(id?:string){if(disposed)return;if(id){restoreOccurrence(id);return;}const latest=[...jobs].reverse().find(([,job])=>!job.applying);if(latest){cancel(latest[0]);message='已取消';notify();return;}const last=[...records.keys()].at(-1);if(last)restoreOccurrence(last);},
  setSuspended(value:boolean){if(disposed||suspended===value)return;suspended=value;if(value){for(const [id,job] of jobs)if(!job.applying)cancel(id);}notify();},
  async reset(next:FlipSessionDomain){if(disposed)return;const started=++generation;domain={...next};for(const id of jobs.keys())cancel(id);records.clear();message='';lastChange=null;notify();try{await options.restoreAll();}catch{if(started===generation&&!disposed)message='原词恢复未完成，请重试';}if(started===generation)notify();},
  completed:()=>Array.from(records.values(),snapshot),
  async rebind(bind:(c:CompletedFlip)=>Promise<void>){const started=generation;for(const c of [...records.values()]){if(disposed||started!==generation)return;await bind(snapshot(c));}},
  status:()=>({pending:jobs.size,message,lastChange:lastChange?{...lastChange}:null}),
  dispose(){if(disposed)return;disposed=true;generation++;for(const id of jobs.keys())cancel(id);records.clear();},
 };
}
