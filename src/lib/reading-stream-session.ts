import {AIStreamError,consumeAIStream} from './ai-stream';
import type {ReadingAnswer,ReadingRequest} from '@/server/reading-assistant/service';
export type ReadingStreamState={draft:string;answer:ReadingAnswer|null;busy:boolean;error:string};
type Run=(input:ReadingRequest,signal:AbortSignal,onDraft:(text:string)=>void)=>Promise<ReadingAnswer>;
export async function requestReadingAnswer(input:ReadingRequest,signal:AbortSignal,onDraft:(text:string)=>void=()=>{}):Promise<ReadingAnswer>{
 const response=await fetch('/api/reading-assistant',{method:'POST',signal,headers:{'Content-Type':'application/json',Accept:'application/x-ndjson'},body:JSON.stringify(input)});
 let draft='';
 const answer=await consumeAIStream<ReadingAnswer>(response,signal,event=>{if(!signal.aborted&&event.type==='delta'){draft+=event.text;onDraft(draft);}});
 signal.throwIfAborted();if(!answer||typeof answer.answer!=='string'||!answer.answer.trim())throw new AIStreamError('INVALID_OUTPUT','结果未通过校验，请重试');
 return answer;
}
/** Request generations, not transport arrival time, own UI state. */
export function createReadingStreamSession(changed:(state:ReadingStreamState)=>void,run:Run=requestReadingAnswer){
 let state:ReadingStreamState={draft:'',answer:null,busy:false,error:''},generation=0,controller:AbortController|null=null;
 const publish=(next:ReadingStreamState)=>{state=next;changed(next);};
 return {
  state:()=>state,
  async start(input:ReadingRequest){
   controller?.abort();const id=++generation,c=new AbortController();controller=c;
   publish({draft:'',answer:null,busy:true,error:''});
   const current=()=>generation===id&&!c.signal.aborted;
   try{
    const answer=await run(input,c.signal,draft=>{if(current())publish({...state,draft});});
    if(current())publish({...state,answer,busy:false});
   }catch(error){
    if(current())publish({...state,busy:false,error:error instanceof AIStreamError?error.message:'生成未完成，已显示内容尚未校验，请重试'});
   }finally{if(generation===id){controller=null;if(state.busy)publish({...state,busy:false});}}
  },
  reset(){generation++;controller?.abort();controller=null;publish({draft:'',answer:null,busy:false,error:''});},
  stop(){generation++;controller?.abort();controller=null;publish({...state,busy:false,error:state.busy&&state.draft?'已停止，已显示内容尚未校验':state.error});},
  dispose(){generation++;controller?.abort();controller=null;},
 };
}
