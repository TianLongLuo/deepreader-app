import {randomUUID} from 'node:crypto';
import {AIStreamError,parseAIStreamEvent,streamBudget,type AIStreamEvent} from '@/lib/ai-stream';
const publicMessages:Record<string,string>={FAILED:'生成未完成，请稍后重试',INVALID_OUTPUT:'结果未通过校验，请重试',INVALID_STREAM:'流式响应未完成，请重试',TOO_LARGE:'响应超过大小限制，请缩短内容后重试',RATE_LIMITED:'请求较频繁，请稍后重试',UNAVAILABLE:'请检查 AI 权限和模型设置后重试',STREAM_UNSUPPORTED:'当前模型未启用流式输出，请检查设置',TIMEOUT:'生成超时，请重试'};
export function publicAIStreamError(error:unknown){
 const proposed=error instanceof AIStreamError?error.code:(error as {code?:unknown}|null)?.code;
 const code=typeof proposed==='string'&&Object.hasOwn(publicMessages,proposed)?proposed:'FAILED';
 return {code,message:publicMessages[code]};
}
/** Stream real generator events, propagating disconnects and reader cancellation upstream. */
export function aiStreamResponse<T>(requestSignal:AbortSignal,generate:(signal:AbortSignal)=>AsyncIterable<AIStreamEvent<T>>):Response{
 const cancellation=new AbortController(),signal=AbortSignal.any([requestSignal,cancellation.signal]),encoder=new TextEncoder();
 let closed=false,timer:ReturnType<typeof setInterval>|undefined;
 const stop=()=>{clearInterval(timer);timer=undefined;};
 return new Response(new ReadableStream<Uint8Array>({
  async start(controller){
   let requestId:string|null=null,terminal=false;const budget=streamBudget();
   const emit=(event:AIStreamEvent<T>)=>{if(!closed){budget(event);controller.enqueue(encoder.encode(JSON.stringify(event)+'\n'));}};
   const abort=()=>{stop();if(!closed){closed=true;controller.error(signal.reason??new DOMException('Cancelled','AbortError'));}};
   signal.addEventListener('abort',abort,{once:true});
   try{
    signal.throwIfAborted();
    timer=setInterval(()=>{if(requestId&&!closed)emit({requestId,type:'heartbeat'});},15000);
    for await(const raw of generate(signal)){
     signal.throwIfAborted();const event=parseAIStreamEvent<T>(raw);
     if(requestId===null){if(event.type!=='start')throw new AIStreamError('INVALID_STREAM','');requestId=event.requestId;}
     else if(event.requestId!==requestId||event.type==='start')throw new AIStreamError('INVALID_STREAM','');
     emit(event.type==='error'?{...event,...publicAIStreamError(event)}:event);
     if(event.type==='complete'||event.type==='error'){terminal=true;break;}
    }
    if(!terminal)throw new AIStreamError('INVALID_OUTPUT','');
   }catch(error){
    if(!signal.aborted&&!closed){
     if(!requestId){requestId=randomUUID();emit({requestId,type:'start',cached:false});}
     emit({requestId,type:'error',...publicAIStreamError(error)});
    }
   }finally{
    stop();signal.removeEventListener('abort',abort);if(!closed){closed=true;controller.close();}
   }
  },
  cancel(){closed=true;stop();cancellation.abort();},
 }),{headers:{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'private, no-store, no-transform','X-Accel-Buffering':'no'}});
}
