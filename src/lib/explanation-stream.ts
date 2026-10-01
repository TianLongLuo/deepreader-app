import {consumeAIStream} from './ai-stream';
export type LegacyExplanationEvent<T>={type:'chunk';text:string}|{type:'cached'|'final';explanation:T}|{type:'error';error:string};
/** Explicit UI adapter: transport validation/cancellation stays in one shared consumer. */
export function consumeExplanationStream<T>(response:Response,signal:AbortSignal,onEvent:(event:LegacyExplanationEvent<T>)=>void):Promise<T>{
 let cached=false;
 return consumeAIStream<T>(response,signal,event=>{
  if(event.type==='start')cached=event.cached;
  else if(event.type==='delta')onEvent({type:'chunk',text:event.text});
  else if(event.type==='complete')onEvent({type:cached?'cached':'final',explanation:event.value});
  else if(event.type==='error')onEvent({type:'error',error:event.message});
 });
}
