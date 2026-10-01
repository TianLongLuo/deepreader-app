import {expect,it,vi} from 'vitest';
import {streamMeaningGroups} from '@/server/reading-assistant/meaning-groups';
import {alignMeaningPrefix} from '@/lib/meaning-groups';
import type {ResolvedAIConfig} from '@/server/ai/config-resolver';
const scope={workspaceId:'meaning-stream',userId:'reader'};
const input={documentId:'d',sourceLanguage:'en' as const,text:'The engine started.'};
const config=(stream?:ResolvedAIConfig['provider']['stream']):ResolvedAIConfig=>({provider:{complete:vi.fn(),stream},providerKey:'fixture',model:'fixture',maxTokens:3000,settingsHash:'1',promptVersion:'1',cacheEnabled:false,saveRawPrompt:false,saveRawResponse:false,saveRequestInput:false});
const collect=async<T>(events:AsyncIterable<T>)=>{const values:T[]=[];for await(const value of events)values.push(value);return values;};
it('emits only complete validated groups with original source offsets before provider completion',async()=>{
 let release!:()=>void;const held=new Promise<void>(r=>release=r);
 const c=config(async function*(){yield {content:'{"groups":[{"text":"The engine"},'};await held;yield {content:'{"text":"started.","verbs":["started"]}]}'};});
 const iterator=streamMeaningGroups(scope,input,c)[Symbol.asyncIterator]();
 expect((await iterator.next()).value).toMatchObject({type:'start'});
 expect((await iterator.next()).value).toMatchObject({type:'unit',index:0,value:{text:input.text,groups:[{start:0,end:10,text:'The engine'}]}});
 expect(c.provider.complete).not.toHaveBeenCalled();release();let final;for(let n=await iterator.next();!n.done;n=await iterator.next())final=n.value;
 expect(final).toMatchObject({type:'complete',value:{groups:[{start:0,end:10,text:'The engine'},{start:11,end:19,text:'started.'}],verbs:[{start:11,end:18,text:'started'}]}});
});
it('validates boundaries against the whole source, not a truncated prefix',()=>{
 expect(()=>alignMeaningPrefix(input.text,{groups:[{text:'Th'}]})).toThrow();
 expect(()=>alignMeaningPrefix(input.text,{groups:[{text:'The engine',verbs:['started']}]})).toThrow();
 expect(alignMeaningPrefix(input.text,{groups:[{text:'The engine'}]}).text).toBe(input.text);
});
it.each(['{"groups":[{"text":"The engine"},','{"groups":[{"text":"The engine"},{"text":"invented"}]}'])('never caches incomplete coverage or invalid suffixes',async raw=>{
 let calls=0;const c={...config(async function*(){calls++;yield {content:raw};}),cacheEnabled:true};
 for(let i=0;i<2;i++)await expect(collect(streamMeaningGroups({...scope,userId:raw},input,c))).rejects.toThrow();expect(calls).toBe(2);
});
it('does not pay again for successful validated cache hits',async()=>{
 let calls=0;const c={...config(async function*(){calls++;yield {content:'{"groups":[{"text":"The engine started."}]}'};}),cacheEnabled:true};
 await collect(streamMeaningGroups({...scope,userId:'cached'},input,c));
 const events=await collect(streamMeaningGroups({...scope,userId:'cached'},input,c));
 expect(events.map(e=>e.type)).toEqual(['start','complete']);expect(events[0]).toMatchObject({cached:true});expect(calls).toBe(1);
});
it('requires stream support without a complete fallback',async()=>{
 const c=config();await expect(collect(streamMeaningGroups({...scope,userId:'unsupported'},input,c))).rejects.toMatchObject({code:'STREAM_UNSUPPORTED'});expect(c.provider.complete).not.toHaveBeenCalled();
});
it('splits long API inputs into bounded provider units and still covers the tail',async()=>{
 const lengths:number[]=[];
 const c=config(async function*(request){const text=JSON.parse(request.userPrompt).sourceText;lengths.push(text.length);yield {content:JSON.stringify({groups:[{text}]})};});
 const text='She waited. '.repeat(240).trim();
 const events=await collect(streamMeaningGroups({...scope,userId:'long'},{...input,text},c));
 expect(lengths.length).toBeGreaterThan(1);expect(Math.max(...lengths)).toBeLessThanOrEqual(1200);
 expect(events.at(-1)).toMatchObject({type:'complete',value:{text}});
});
it('cancels the final subscriber upstream without caching its prefix',async()=>{
 let upstream!:AbortSignal,release!:()=>void;
 const held=new Promise<void>(resolve=>release=resolve);
 const c={...config(async function*(request){upstream=request.signal!;yield {content:'{"groups":[{"text":"The engine"},'};await held;upstream.throwIfAborted();yield {content:'{"text":"started."}]}'};}),cacheEnabled:true};
 const abort=new AbortController(),iterator=streamMeaningGroups({...scope,userId:'cancel'},input,c,abort.signal)[Symbol.asyncIterator]();
 await iterator.next();await iterator.next();abort.abort();
 await expect(iterator.next()).rejects.toMatchObject({name:'AbortError'});expect(upstream.aborted).toBe(true);release();
});
