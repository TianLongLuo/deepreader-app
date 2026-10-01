import {randomUUID} from 'node:crypto';
import type {ExplanationResponse} from '@/types/explanation';
import type {AIStreamEvent} from '@/lib/ai-stream';
import type {ExplanationStreamEvent} from './explanation.service';
import {aiStreamResponse} from './stream-response';
/** Adapt existing section generation without buffering or fabricating model deltas. */
export function explanationStream(requestSignal:AbortSignal,generate:(signal:AbortSignal)=>AsyncIterable<ExplanationStreamEvent>){
 return aiStreamResponse<ExplanationResponse>(requestSignal,async function*(signal):AsyncIterable<AIStreamEvent<ExplanationResponse>>{
  const requestId=randomUUID();let started=false;
  for await(const event of generate(signal)){
   if(!started){started=true;yield {requestId,type:'start',cached:event.type==='cached'};}
   if(event.type==='chunk')yield {requestId,type:'delta',text:event.text};
   else if(event.type==='cached'||event.type==='final')yield {requestId,type:'complete',value:event.explanation};
   else yield {requestId,type:'error',code:'FAILED',message:event.error};
  }
  if(!started)yield {requestId,type:'start',cached:false};
 });
}
