import {expect,it,vi} from 'vitest';
import {streamReadingAnswer} from '@/server/reading-assistant/stream-service';
import {readingRequestSchema,type ReadingAnswer} from '@/server/reading-assistant/service';
import type {ResolvedAIConfig} from '@/server/ai/config-resolver';
import type {AIStreamEvent} from '@/lib/ai-stream';
const scope={workspaceId:'stream-w',userId:'u'};
const input=readingRequestSchema.parse({documentId:'d',mode:'word',text:'An occasion.',sourceLanguage:'en',level:'intermediate',language:'English'});
const config=(stream?:ResolvedAIConfig['provider']['stream']):ResolvedAIConfig=>({provider:{complete:vi.fn(),stream},providerKey:'fixture',model:'fixture',maxTokens:3000,settingsHash:'1',promptVersion:'1',cacheEnabled:true,saveRawPrompt:false,saveRawResponse:false,saveRequestInput:false});
const collect=async<T>(events:AsyncIterable<T>)=>{const values:T[]=[];for await(const value of events)values.push(value);return values;};
it('emits an answer before provider completion and validates final quotes',async()=>{
 let release!:()=>void;const held=new Promise<void>(r=>release=r);
 const c=config(async function*(){yield {content:'{"answer":"Meaning'};await held;yield {content:' here","citations":[{"quote":"An occasion."}]}'};});
 const events=streamReadingAnswer(scope,input,c,new AbortController().signal)[Symbol.asyncIterator]();
 expect((await events.next()).value).toMatchObject({type:'start',cached:false});
 expect((await events.next()).value).toMatchObject({type:'delta',text:'Meaning'});expect(c.provider.complete).not.toHaveBeenCalled();
 release();const rest:AIStreamEvent<ReadingAnswer>[]=[];let next;while(!(next=await events.next()).done)rest.push(next.value);
 expect(rest.at(-1)).toMatchObject({type:'complete',value:{answer:'Meaning here',citations:[{quote:'An occasion.'}]}});
});
it.each(['{"answer":"draft","citations":[{"quote":"invented"}]}','{"answer":"truncated'])('does not cache invalid or incomplete output',async raw=>{
 let calls=0;const c=config(async function*(){calls++;yield {content:raw};});
 for(let i=0;i<2;i++)await expect(collect(streamReadingAnswer({...scope,userId:raw},input,c))).rejects.toThrow();expect(calls).toBe(2);
});
it('uses cached completion directly and isolates user and model settings',async()=>{
 let calls=0;const c=config(async function*(){calls++;yield {content:'{"answer":"Context","citations":[]}'};});
 await collect(streamReadingAnswer({...scope,userId:'cache'},input,c));
 const cached=await collect(streamReadingAnswer({...scope,userId:'cache'},input,c));
 expect(cached.map(e=>e.type)).toEqual(['start','complete']);expect(cached[0]).toMatchObject({cached:true});expect(calls).toBe(1);
 await collect(streamReadingAnswer({...scope,userId:'other'},input,c));await collect(streamReadingAnswer({...scope,userId:'cache'},input,{...c,settingsHash:'2'}));expect(calls).toBe(3);
});
it('never exposes quiz answers in streamed deltas',async()=>{
 const c=config(async function*(){yield {content:'{"answer":"secret answer","questions":[{"question":"Which?","answer":"secret answer","quote":"An occasion."}]}'};});
 const events=await collect(streamReadingAnswer({...scope,userId:'quiz'},{...input,mode:'quiz'},c));
 expect(events.filter(e=>e.type==='delta')).toEqual([]);expect(events.at(-1)?.type).toBe('complete');
});
it('adds the excerpt scope notice only once while streaming a summary',async()=>{
 const c=config(async function*(){yield {content:'{"answer":"Summary","citations":[]}'};});
 const events=await collect(streamReadingAnswer({...scope,userId:'summary'},{...input,mode:'summary'},c));
 const draft=events.filter(e=>e.type==='delta').map(e=>e.type==='delta'?e.text:'').join('');
 expect(draft.match(/不代表全书/g)).toHaveLength(1);expect(events.at(-1)).toMatchObject({type:'complete',value:{answer:draft}});
});
it('requires a streaming provider and never calls complete as a fallback',async()=>{
 const c=config();await expect(collect(streamReadingAnswer({...scope,userId:'unsupported'},input,c))).rejects.toMatchObject({code:'STREAM_UNSUPPORTED'});expect(c.provider.complete).not.toHaveBeenCalled();
});
it('does not cache provider failure after displaying a draft',async()=>{
 let calls=0;const c=config(async function*(){calls++;yield {content:'{"answer":"Draft'};throw new Error('upstream secret');});
 for(let i=0;i<2;i++)await expect(collect(streamReadingAnswer({...scope,userId:'failure'},input,c))).rejects.toThrow();expect(calls).toBe(2);
});
it('keeps shared streaming upstream alive until its last subscriber leaves',async()=>{
 let upstream!:AbortSignal,release!:()=>void,calls=0;
 const held=new Promise<void>(resolve=>release=resolve);
 const c=config(async function*(request){calls++;upstream=request.signal!;yield {content:'{"answer":"Shared'};await held;upstream.throwIfAborted();yield {content:'","citations":[]}'};});
 const a=new AbortController(),b=new AbortController();
 const first=streamReadingAnswer({...scope,userId:'shared'},input,c,a.signal)[Symbol.asyncIterator](),second=streamReadingAnswer({...scope,userId:'shared'},input,c,b.signal)[Symbol.asyncIterator]();
 await first.next();await second.next();await first.next();await second.next();
 a.abort();await expect(first.next()).rejects.toMatchObject({name:'AbortError'});expect(upstream.aborted).toBe(false);
 release();let final;for(let next=await second.next();!next.done;next=await second.next())final=next.value;
 expect(final).toMatchObject({type:'complete'});expect(calls).toBe(1);
});
it('rejects oversized final results before caching them',async()=>{
 let calls=0;const text='字'.repeat(6000),value={answer:'字'.repeat(10000),citations:Array.from({length:6},()=>({quote:text}))};
 const c=config(async function*(){calls++;yield {content:JSON.stringify(value)};});
 for(let i=0;i<2;i++)await expect(collect(streamReadingAnswer({...scope,userId:'oversize-final'},{...input,text},c))).rejects.toMatchObject({code:'TOO_LARGE'});
 expect(calls).toBe(2);
});
it('does not duplicate the scope notice if the model includes it',async()=>{
 const notice='仅基于本次提供的章节片段（不代表全书）。';
 const c=config(async function*(){yield {content:JSON.stringify({answer:notice+'\n\nSummary'})};});
 const events=await collect(streamReadingAnswer({...scope,userId:'scope-duplicate'},{...input,mode:'summary'},c));
 const delta=events.filter(e=>e.type==='delta').map(e=>e.type==='delta'?e.text:'').join('');
 expect(delta.match(/不代表全书/g)).toHaveLength(1);expect(events.at(-1)).toMatchObject({value:{answer:delta}});
});
