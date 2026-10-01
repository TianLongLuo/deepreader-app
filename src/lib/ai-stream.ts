export type AIStreamEvent<T>={requestId:string}&({type:'start';cached:boolean}|{type:'delta';text:string}|{type:'unit';index:number;value:T}|{type:'heartbeat'}|{type:'complete';value:T}|{type:'error';code:string;message:string});
export const AI_STREAM_EVENT_BYTES=1024*1024;
export const AI_STREAM_RESULT_BYTES=128*1024;
const encoder=new TextEncoder();
export const streamBytes=(value:string)=>encoder.encode(value).byteLength;
export class AIStreamError extends Error{
 constructor(public readonly code:string,message:string){super(message);this.name='AIStreamError';}
}
export function parseAIStreamEvent<T>(value:unknown):AIStreamEvent<T>{
 if(!value||typeof value!=='object')throw new AIStreamError('INVALID_STREAM','流式响应格式不正确');
 const e=value as Record<string,unknown>;
 if(typeof e.requestId!=='string'||!e.requestId||e.requestId.length>200)throw new AIStreamError('INVALID_STREAM','流式请求标识不正确');
 const valid=e.type==='start'?typeof e.cached==='boolean':e.type==='delta'?typeof e.text==='string':e.type==='unit'?Number.isSafeInteger(e.index)&&Number(e.index)>=0&&'value'in e:e.type==='heartbeat'?true:e.type==='complete'?'value'in e:e.type==='error'?typeof e.code==='string'&&e.code.length<=80&&typeof e.message==='string'&&e.message.length<=512:false;
 if(!valid)throw new AIStreamError('INVALID_STREAM','流式事件格式不正确');return value as AIStreamEvent<T>;
}
/** Enforce payload limits on both sides of the wire, not only when saving a result. */
export function assertStreamResult(value:unknown){if(streamBytes(JSON.stringify(value))>AI_STREAM_RESULT_BYTES)throw new AIStreamError('TOO_LARGE','响应超过大小限制');}
export function streamBudget(){
 let deltas=0,units=0;
 return (event:AIStreamEvent<unknown>)=>{
  if(streamBytes(JSON.stringify(event))>AI_STREAM_EVENT_BYTES)throw new AIStreamError('TOO_LARGE','响应超过大小限制');
  if(event.type==='delta')deltas+=streamBytes(event.text);
  if(event.type==='unit')units=streamBytes(JSON.stringify(event.value));
  if((event.type==='delta'&&deltas>AI_STREAM_RESULT_BYTES)||(event.type==='unit'&&units>AI_STREAM_RESULT_BYTES)||(event.type==='complete'&&streamBytes(JSON.stringify(event.value))>AI_STREAM_RESULT_BYTES))throw new AIStreamError('TOO_LARGE','响应超过大小限制');
 };
}
/** A draft, EOF or a canceled request is never returned as a validated completion. */
export async function consumeAIStream<T>(response:Response,signal:AbortSignal,onEvent:(event:AIStreamEvent<T>)=>void):Promise<T>{
 signal.throwIfAborted();
 if(!response.ok)throw new AIStreamError(`HTTP_${response.status}`,'请求未完成，请稍后重试');
 if(!response.body||!response.headers.get('content-type')?.includes('application/x-ndjson'))throw new AIStreamError('INVALID_STREAM','流式响应格式不正确');
 const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true}),budget=streamBudget();
 let buffer='',requestId:string|null=null,complete=false,result!:T;
 const abort=()=>{void reader.cancel(signal.reason).catch(()=>{});};
 signal.addEventListener('abort',abort,{once:true});
 const line=(raw:string)=>{
  if(!raw.trim())return;
  if(streamBytes(raw)>AI_STREAM_EVENT_BYTES)throw new AIStreamError('TOO_LARGE','响应超过大小限制');
  let decoded:unknown;try{decoded=JSON.parse(raw);}catch{throw new AIStreamError('INVALID_STREAM','流式事件格式不正确');}
  const event=parseAIStreamEvent<T>(decoded);budget(event);
  if(requestId===null){if(event.type!=='start')throw new AIStreamError('INVALID_STREAM','流式响应缺少开始事件');requestId=event.requestId;}
  else if(event.requestId!==requestId||event.type==='start')throw new AIStreamError('INVALID_STREAM','流式请求标识不匹配');
  onEvent(event);
  if(event.type==='error')throw new AIStreamError(event.code,event.message);
  if(event.type==='complete'){result=event.value;complete=true;}
 };
 try{
  while(!complete){
   signal.throwIfAborted();const chunk=await reader.read();signal.throwIfAborted();
   buffer+=chunk.done?decoder.decode():decoder.decode(chunk.value,{stream:true});
   let boundary:number;
   while((boundary=buffer.indexOf('\n'))>=0&&!complete){const next=buffer.slice(0,boundary);buffer=buffer.slice(boundary+1);line(next);}
   if(buffer.length>AI_STREAM_EVENT_BYTES)throw new AIStreamError('TOO_LARGE','响应超过大小限制');
   if(chunk.done){if(!complete&&buffer.trim())line(buffer);break;}
  }
  if(!complete)throw new AIStreamError('INTERRUPTED','生成中断，已显示内容尚未校验，请重试');
  return result;
 }finally{
  signal.removeEventListener('abort',abort);await reader.cancel().catch(()=>{});reader.releaseLock();
 }
}
