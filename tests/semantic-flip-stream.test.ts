import {afterEach,expect,it,vi} from 'vitest';
import {streamSemanticFlip,checkSemanticFlipQuota} from '@/server/reading-assistant/semantic-flip';
import {acquireReadingAIQuota,ReadingAILimitError} from '@/server/reading-assistant/reading-ai-budget';
import type {ResolvedAIConfig} from '@/server/ai/config-resolver';
const input={documentId:'doc',sourceLanguage:'en' as const,targetLanguage:'en' as const,sourceText:'She chose the dress for the occasion.',start:28,end:36,targetWord:'occasion',occurrence:'word-1'};
let owner=0;const scope=()=>({workspaceId:'semantic-test',userId:'user-'+owner++});
const config=(stream?:ResolvedAIConfig['provider']['stream']):ResolvedAIConfig=>({provider:{complete:vi.fn(),stream},providerKey:'fixture',model:'fixture',maxTokens:3000,settingsHash:'s1',promptVersion:'p1',cacheEnabled:false,saveRawPrompt:false,saveRawResponse:false,saveRequestInput:false});
const collect=async<T>(events:AsyncIterable<T>)=>{const values:T[]=[];for await(const event of events)values.push(event);return values;};
afterEach(()=>vi.useRealTimers());
it('withholds partial JSON until one validated completion and obeys token caps',async()=>{
 let release!:()=>void;const held=new Promise<void>(yes=>release=yes);let seen:unknown;
 const c=config(async function*(request){seen=request;yield {content:'{"replacement":"special '};await held;yield {content:'event"}'};});
 const iterator=streamSemanticFlip(scope(),input,c)[Symbol.asyncIterator]();expect((await iterator.next()).value).toMatchObject({type:'start'});
 let completed=false;const result=iterator.next().then(value=>{completed=true;return value;});await Promise.resolve();await Promise.resolve();expect(completed).toBe(false);release();
 expect((await result).value).toMatchObject({type:'complete',value:{replacement:'special event',provider:'fixture',model:'fixture'}});
 expect(seen).toMatchObject({maxTokens:256,temperature:.1});expect(c.provider.complete).not.toHaveBeenCalled();
});
it('repairs format once, counts the second acquisition and caches only valid results',async()=>{
 let calls=0;const s=scope(),c={...config(async function*(){calls++;yield {content:calls===1?'not JSON':'{"replacement":"special event"}'};}),cacheEnabled:true,maxTokens:64};
 expect((await collect(streamSemanticFlip(s,input,c))).at(-1)).toMatchObject({type:'complete',value:{replacement:'special event'}});expect(calls).toBe(2);
 for(let i=0;i<22;i++)acquireReadingAIQuota(s)();expect(()=>acquireReadingAIQuota(s)).toThrow(ReadingAILimitError);
 expect(()=>checkSemanticFlipQuota(s,input,c)).not.toThrow();await collect(streamSemanticFlip(s,input,c));expect(calls).toBe(2);
});
it('never caches a second invalid format and never repairs a provider failure',async()=>{
 let invalidCalls=0;const s=scope(),c={...config(async function*(){invalidCalls++;yield {content:'{"replacement":"<b>wrong</b>"}'};}),cacheEnabled:true};
 for(let i=0;i<2;i++)await expect(collect(streamSemanticFlip(s,input,c))).rejects.toMatchObject({code:'INVALID_OUTPUT'});expect(invalidCalls).toBe(4);
 let failures=0;const provider=config(async function*(){failures++;throw new SyntaxError('provider JSON/network failure');yield {content:''};});
 await expect(collect(streamSemanticFlip(scope(),input,provider))).rejects.toThrow('provider JSON/network failure');expect(failures).toBe(1);
});
it('keeps target language, occurrence, context, model, settings and account cache domains distinct',async()=>{
 let calls=0;const s=scope(),c={...config(async function*(){calls++;yield {content:'{"replacement":"event"}'};}),cacheEnabled:true};
 await collect(streamSemanticFlip(s,input,c));await collect(streamSemanticFlip(s,input,c));expect(calls).toBe(1);
 await collect(streamSemanticFlip(s,{...input,targetLanguage:'zh'},c));await collect(streamSemanticFlip(s,{...input,occurrence:'word-2'},c));await collect(streamSemanticFlip(s,{...input,previousText:'A previous event.'},c));
 await collect(streamSemanticFlip(s,input,{...c,model:'other'}));await collect(streamSemanticFlip(s,input,{...c,settingsHash:'s2'}));await collect(streamSemanticFlip(scope(),input,c));expect(calls).toBe(7);
 await collect(streamSemanticFlip(s,input,{...c,cacheEnabled:false}));await collect(streamSemanticFlip(s,input,{...c,cacheEnabled:false}));expect(calls).toBe(9);
});
it('cancels the last subscriber without releasing a provider that ignores abort until it actually stops',async()=>{
 let release!:()=>void,upstream!:AbortSignal;const held=new Promise<void>(yes=>release=yes),s=scope(),abort=new AbortController();
 const c={...config(async function*(request){upstream=request.signal!;await held;yield {content:'{"replacement":"event"}'};}),cacheEnabled:true};
 const iterator=streamSemanticFlip(s,input,c,abort.signal)[Symbol.asyncIterator]();await iterator.next();const pending=iterator.next();for(let i=0;i<6;i++)await Promise.resolve();abort.abort();
 await expect(pending).rejects.toMatchObject({name:'AbortError'});expect(upstream.aborted).toBe(true);
 const other=acquireReadingAIQuota(s);expect(()=>acquireReadingAIQuota(s)).toThrow(ReadingAILimitError);other();release();for(let i=0;i<12;i++)await Promise.resolve();
 const after=acquireReadingAIQuota(s);after();
});
it('uses one total 30-second deadline across repair attempts and does not cache a timed-out result',async()=>{
 vi.useFakeTimers();let calls=0;const s=scope(),c={...config(async function*(){calls++;await new Promise(resolve=>setTimeout(resolve,calls===1?20000:20000));yield {content:calls===1?'bad JSON':'{"replacement":"event"}'};}),cacheEnabled:true};
 const operation=collect(streamSemanticFlip(s,input,c)),assert=expect(operation).rejects.toMatchObject({code:'TIMEOUT'});await vi.advanceTimersByTimeAsync(30001);await assert;expect(calls).toBe(2);await vi.advanceTimersByTimeAsync(20000);
 const retry={...c,provider:{...c.provider,stream:async function*(){calls++;yield {content:'{"replacement":"event"}'};}}};await collect(streamSemanticFlip(s,input,retry));expect(calls).toBe(3);
});
it('bounds completed cache at 256 LRU entries and expires it after 24 hours',async()=>{
 vi.useFakeTimers();let calls=0;const s=scope(),c={...config(async function*(){calls++;yield {content:'{"replacement":"event"}'};}),cacheEnabled:true};
 for(let i=0;i<256;i++){if(i&&i%24===0)vi.advanceTimersByTime(60000);await collect(streamSemanticFlip(s,{...input,occurrence:'k'+i},c));}
 await collect(streamSemanticFlip(s,{...input,occurrence:'k0'},c));expect(calls).toBe(256);
 await collect(streamSemanticFlip(s,{...input,occurrence:'k256'},c));await collect(streamSemanticFlip(s,{...input,occurrence:'k0'},c));expect(calls).toBe(257);
 await collect(streamSemanticFlip(s,{...input,occurrence:'k1'},c));expect(calls).toBe(258);
 vi.advanceTimersByTime(24*60*60*1000);await collect(streamSemanticFlip(s,{...input,occurrence:'k0'},c));expect(calls).toBe(259);
});
it('requires native provider streaming and never falls back to complete',async()=>{
 const c=config();await expect(collect(streamSemanticFlip(scope(),input,c))).rejects.toMatchObject({code:'STREAM_UNSUPPORTED'});expect(c.provider.complete).not.toHaveBeenCalled();
});
it('instructs one-word translation not to duplicate grammar carried by adjacent auxiliaries',async()=>{
 let prompt='';const c=config(async function*(request){prompt=request.systemPrompt;yield {content:'{"replacement":"negociar"}'};});
 const sourceText='We will negotiate a better price.';await collect(streamSemanticFlip(scope(),{...input,targetLanguage:'es',sourceText,start:8,end:17,targetWord:'negotiate'},c));expect(prompt).toContain('will negotiate');expect(prompt).toContain('negociar');expect(prompt).toContain('Do not duplicate tense');
});
it('sends only semantic source data to the model, not internal routing IDs or long CFI metadata',async()=>{
 let seen='';const c=config(async function*(request){seen=request.userPrompt;yield {content:'{"replacement":"event"}'};});
 const routed={...input,documentId:'private-document-route',occurrence:'epubcfi-internal-routing-'+('x'.repeat(1800)),previousText:'It was a celebration.',nextText:'She arrived early.'};
 await collect(streamSemanticFlip(scope(),routed,c));
 const payload=JSON.parse(seen);expect(payload.data).toEqual({sourceText:routed.sourceText,start:routed.start,end:routed.end,targetWord:routed.targetWord,previousText:routed.previousText,nextText:routed.nextText,sourceLanguage:'en',targetLanguage:'en'});
 expect(seen).not.toContain(routed.documentId);expect(seen).not.toContain(routed.occurrence);
 expect(seen.length).toBeLessThan(400);expect(payload.formatRepair).toBe(false);
});
