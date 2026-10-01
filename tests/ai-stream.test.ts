import {expect,it,vi} from 'vitest';
import {consumeAIStream,type AIStreamEvent} from '@/lib/ai-stream';
import {aiStreamResponse} from '@/server/ai/stream-response';
const encoder=new TextEncoder(),signal=()=>new AbortController().signal;
const start={requestId:'one',type:'start' as const,cached:false};
const delta={requestId:'one',type:'delta' as const,text:'niño 😀'};
const complete={requestId:'one',type:'complete' as const,value:{answer:'niño 😀'}};
const response=(events:unknown[],chunkSize=1000,finalNewline=true)=>{
 const bytes=encoder.encode(events.map(e=>JSON.stringify(e)).join('\n')+(finalNewline?'\n':''));
 return new Response(new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=chunkSize)c.enqueue(bytes.slice(i,i+chunkSize));c.close();}}),{headers:{'Content-Type':'application/x-ndjson'}});
};
it('decodes split UTF8, observes real deltas and accepts the final line without newline',async()=>{
 const observed:AIStreamEvent<{answer:string}>[]=[];
 expect(await consumeAIStream<{answer:string}>(response([start,delta,complete],1,false),signal(),e=>observed.push(e))).toEqual(complete.value);
 expect(observed.map(e=>e.type)).toEqual(['start','delta','complete']);expect(observed[1]).toEqual(delta);
});
it('rejects EOF without complete instead of returning a partial draft',async()=>{
 await expect(consumeAIStream(response([start,delta]),signal(),()=>{})).rejects.toThrow();
});
it('rejects cross-request events and malformed shapes',async()=>{
 for(const events of [[start,{...delta,requestId:'two'}],[delta,complete],[start,{...delta,text:4}],[start,{type:'invented',requestId:'one'}]])await expect(consumeAIStream(response(events),signal(),()=>{})).rejects.toThrow();
});
it('enforces per-event and total result size limits',async()=>{
 for(const events of [[start,{...delta,text:'x'.repeat(1024*1024+1)}],[start,{...delta,text:'x'.repeat(128*1024+1)}],[start,{...complete,value:{answer:'x'.repeat(128*1024+1)}}]])await expect(consumeAIStream(response(events),signal(),()=>{})).rejects.toThrow();
});
it('rejects business error events, notifies the UI and cancels unread data',async()=>{
 const seen:string[]=[];
 await expect(consumeAIStream(response([start,{requestId:'one',type:'error',code:'INVALID_OUTPUT',message:'分析未完成'}]),signal(),e=>seen.push(e.type))).rejects.toMatchObject({code:'INVALID_OUTPUT'});
 expect(seen).toEqual(['start','error']);
});
it('propagates consumer abort promptly even if the source is silent',async()=>{
 const abort=new AbortController();let canceled=false;
 const r=new Response(new ReadableStream({start(c){c.enqueue(encoder.encode(JSON.stringify(start)+'\n'));},cancel(){canceled=true;}}),{headers:{'Content-Type':'application/x-ndjson'}});
 const done=consumeAIStream(r,abort.signal,()=>{});abort.abort();await expect(done).rejects.toMatchObject({name:'AbortError'});expect(canceled).toBe(true);
});
it('delivers the first delta before generation is complete and sets proxy-safe private headers',async()=>{
 let finish!:()=>void;const wait=new Promise<void>(resolve=>{finish=resolve;});let finished=false;
 const r=aiStreamResponse(signal(),async function*(){yield start;yield delta;await wait;finished=true;yield complete;});
 const reader=r.body!.getReader(),first=await reader.read(),second=await reader.read();
 expect(new TextDecoder().decode(first.value)).toContain('start');expect(new TextDecoder().decode(second.value)).toContain('niño');expect(finished).toBe(false);
 expect(r.headers.get('cache-control')).toBe('private, no-store, no-transform');expect(r.headers.get('x-accel-buffering')).toBe('no');
 finish();await reader.read();await reader.read();reader.releaseLock();
});
it('sanitizes thrown upstream errors and generator-provided error messages',async()=>{
 for(const generate of [async function*(){yield start;throw new Error('Authorization: sk-secret');},async function*(){yield start;yield {requestId:'one',type:'error' as const,code:'FAILED',message:'sk-secret'};}]){
  const raw=await aiStreamResponse(signal(),generate).text();expect(raw).not.toContain('sk-secret');expect(raw).toContain('error');
 }
});
it('propagates reader cancellation and keeps a different request alive',async()=>{
 let firstSignal!:AbortSignal;const r=aiStreamResponse(signal(),async function*(s){firstSignal=s;yield start;await new Promise<void>(resolve=>s.addEventListener('abort',()=>resolve(),{once:true}));});
 const other=aiStreamResponse(signal(),async function*(){yield {...start,requestId:'two'};yield {...complete,requestId:'two'};});
 const reader=r.body!.getReader();await reader.read();await reader.cancel();expect(firstSignal.aborted).toBe(true);
 expect(await consumeAIStream(other,signal(),()=>{})).toEqual(complete.value);
});
it('sends heartbeats while waiting and clears their timer on cancellation',async()=>{
 vi.useFakeTimers();try{
  const r=aiStreamResponse(signal(),async function*(s){yield start;await new Promise<void>(resolve=>s.addEventListener('abort',()=>resolve(),{once:true}));});
  const reader=r.body!.getReader();await reader.read();await vi.advanceTimersByTimeAsync(15000);
  expect(new TextDecoder().decode((await reader.read()).value)).toContain('heartbeat');
  await reader.cancel();expect(vi.getTimerCount()).toBe(0);
 }finally{vi.useRealTimers();}
});
it('converts missing completion into an error and clears transport resources',async()=>{
 const raw=await aiStreamResponse(signal(),async function*(){yield start;yield delta;}).text();
 expect(raw).toContain('error');expect(raw).not.toContain('complete');
});
it('reports oversize generation as a sanitized terminal error rather than a broken stream',async()=>{
 const raw=await aiStreamResponse(signal(),async function*(){yield start;yield {...delta,text:'x'.repeat(128*1024+1)};yield complete;}).text();
 expect(raw).toContain('TOO_LARGE');expect(raw).not.toContain('complete');
});
it('adapts explanation chunks and cached finals while preserving the legacy section callback',async()=>{
 const {explanationStream}=await import('@/server/ai/explanation-stream');
 const {consumeExplanationStream}=await import('@/lib/explanation-stream');
 const value={status:'COMPLETED',output:{plain_meaning:'meaning'}};
 for(const cached of [true,false]){
  const events:any[]=[];
  const r=explanationStream(signal(),async function*(){if(cached)yield {type:'cached',explanation:value as any};else{yield {type:'chunk',text:'real prefix'};yield {type:'final',explanation:value as any};}});
  expect(await consumeExplanationStream(r,signal(),e=>events.push(e))).toEqual(value);
  expect(events.map(e=>e.type)).toEqual(cached?['cached']:['chunk','final']);
 }
});

it('sanitizes malformed wire JSON instead of echoing its content',async()=>{
 const r=new Response('Authorization: sk-secret\n',{headers:{'Content-Type':'application/x-ndjson'}});
 await expect(consumeAIStream(r,signal(),()=>{})).rejects.toMatchObject({code:'INVALID_STREAM'});
});
it('aborts a waiting generator when the HTTP request disconnects',async()=>{
 const controller=new AbortController();let upstream!:AbortSignal;
 const r=aiStreamResponse(controller.signal,async function*(s){upstream=s;yield start;await new Promise<void>(resolve=>s.addEventListener('abort',()=>resolve(),{once:true}));});
 const reader=r.body!.getReader();await reader.read();controller.abort();
 await expect(reader.read()).rejects.toMatchObject({name:'AbortError'});expect(upstream.aborted).toBe(true);
});
