import {randomUUID} from 'node:crypto';
import {AIStreamError,streamBudget,type AIStreamEvent} from '@/lib/ai-stream';
import {readPartialString} from '@/lib/partial-json-string';
import type {ResolvedAIConfig} from '@/server/ai/config-resolver';
import {awaitWithSignal} from './cancellation';
import {cachedReadingAnswer,parseGroundedAnswer,readingAnswerKey,readingCompletionRequest,readingRequestSchema,scopeAnswerText,storeReadingAnswer,type ReadingAnswer,type ReadingRequest} from './service';
type WithoutId<E>=E extends {requestId:string}?Omit<E,'requestId'>:never;
export type GeneratedEvent<T>=WithoutId<Exclude<AIStreamEvent<T>,{type:'start'|'heartbeat'}>>;
type Subscriber<T>={queue:GeneratedEvent<T>[];wake?:()=>void};
type Flight<T>={controller:AbortController;subscribers:Set<Subscriber<T>>;replay:GeneratedEvent<T>[];done:boolean;failed:boolean;error?:unknown};
const flights=new Map<string,Flight<unknown>>();
function append<T>(queue:GeneratedEvent<T>[],event:GeneratedEvent<T>){
 const last=queue.at(-1);
 if(event.type==='delta'&&last?.type==='delta')queue[queue.length-1]={type:'delta',text:last.text+event.text};
 else if(event.type==='unit'&&last?.type==='unit')queue[queue.length-1]=event;
 else queue.push(event);
}
/** One bounded upstream, replayable prefixes, independent subscriber cancellation. */
export async function* sharedGeneratedEvents<T>(key:string,signal:AbortSignal|undefined,generate:(signal:AbortSignal)=>AsyncIterable<GeneratedEvent<T>>):AsyncIterable<GeneratedEvent<T>>{
 signal?.throwIfAborted();let flight=flights.get(key) as Flight<T>|undefined;
 if(!flight){
  if(flights.size>=128)throw new AIStreamError('UNAVAILABLE','');
  flight={controller:new AbortController(),subscribers:new Set(),replay:[],done:false,failed:false};
  const entry=flight;flights.set(key,entry as Flight<unknown>);
  void Promise.resolve().then(async()=>{
   const budget=streamBudget();
   try{
    for await(const event of generate(entry.controller.signal)){
     entry.controller.signal.throwIfAborted();budget({...event,requestId:'shared'} as AIStreamEvent<T>);append(entry.replay,event);
     for(const subscriber of entry.subscribers){append(subscriber.queue,event);subscriber.wake?.();}
    }
   }catch(error){entry.failed=true;entry.error=error;}
   finally{entry.done=true;for(const subscriber of entry.subscribers)subscriber.wake?.();if(flights.get(key)===entry)flights.delete(key);}
  });
 }
 const subscriber:Subscriber<T>={queue:[...flight.replay]};flight.subscribers.add(subscriber);
 try{
  while(true){
   signal?.throwIfAborted();
   if(subscriber.queue.length){yield subscriber.queue.shift()!;continue;}
   if(flight.done){if(flight.failed)throw flight.error;break;}
   await awaitWithSignal(new Promise<void>(resolve=>{subscriber.wake=resolve;}),signal);subscriber.wake=undefined;
  }
 }finally{
  flight.subscribers.delete(subscriber);subscriber.wake=undefined;
  if(!flight.subscribers.size){flight.controller.abort();if(flights.get(key)===flight)flights.delete(key);}
 }
}
export async function* streamReadingAnswer(scope:{workspaceId:string;userId:string},input:ReadingRequest,config:ResolvedAIConfig,signal?:AbortSignal):AsyncIterable<AIStreamEvent<ReadingAnswer>>{
 signal?.throwIfAborted();input=readingRequestSchema.parse(input);
 const requestId=randomUUID(),key=readingAnswerKey(scope,input,config),cached=cachedReadingAnswer(key,config);
 yield {requestId,type:'start',cached:Boolean(cached)};
 if(cached){yield {requestId,type:'complete',value:{...cached,provider:config.providerKey,model:config.model}};return;}
 if(!config.provider.stream)throw new AIStreamError('STREAM_UNSUPPORTED','');
 for await(const event of sharedGeneratedEvents<ReadingAnswer>('reading-stream:'+key,signal,async function*(upstream){
  let raw='',displayed='';
  for await(const chunk of config.provider.stream!(readingCompletionRequest(input,config,upstream))){
   upstream.throwIfAborted();raw+=chunk.content;if(raw.length>128*1024)throw new AIStreamError('TOO_LARGE','');
   if(input.mode==='quiz')continue; // Answers must not leak in a partial free-form intro.
   const answer=readPartialString(raw,'answer');
   const draft=input.mode==='summary'&&answer?scopeAnswerText(answer):answer;
   if(!draft.startsWith(displayed))throw new AIStreamError('INVALID_OUTPUT','');
   if(draft.length>displayed.length){yield {type:'delta',text:draft.slice(displayed.length)};displayed=draft;}
  }
  upstream.throwIfAborted();const value={...parseGroundedAnswer(raw,input),provider:config.providerKey,model:config.model};
  storeReadingAnswer(key,value,config);yield {type:'complete',value};
 }))yield {...event,requestId};
}
