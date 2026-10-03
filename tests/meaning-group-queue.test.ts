import {expect,it,vi} from 'vitest';
import {createMeaningGroupQueue as newQueue} from '@/components/reader/meaning-group-queue';
import {createReaderAIClientBudget} from '@/components/reader/reader-ai-budget';
import {createMeaningResultCache} from '@/components/reader/meaning-result-cache';
import type {MeaningUnitRef} from '@/components/reader/meaning-window';
import {alignMeaningGroups} from '@/lib/meaning-groups';
const createMeaningGroupQueue=(request:(text:string,signal:AbortSignal)=>Promise<any>,changed:()=>void,cache=createMeaningResultCache())=>newQueue({request,changed,cache,budget:createReaderAIClientBudget()});
const unit=(text:string,key=text):MeaningUnitRef=>({key,text,sourceId:key,location:key,start:0,end:text.length});
const result=(text:string)=>alignMeaningGroups(text,{groups:[{text}]});
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
it('limits concurrency, deduplicates paragraphs and reuses successful session results',async()=>{
 const pending=new Map<string,(v:any)=>void>();let active=0,max=0;
 const fetcher=vi.fn((text:string)=>new Promise<any>(resolve=>{active++;max=Math.max(max,active);pending.set(text,v=>{active--;resolve(v);});}));
 const q=createMeaningGroupQueue(fetcher,()=>{});
 q.setVisible(['One.','One.','Two.','Three.']);await flush();expect(fetcher).toHaveBeenCalledTimes(2);
 pending.get('One.')!(result('One.'));await flush();expect(fetcher).toHaveBeenCalledTimes(3);
 pending.get('Two.')!(result('Two.'));pending.get('Three.')!(result('Three.'));await flush();
 q.setVisible([]);q.setVisible(['One.']);await flush();expect(fetcher).toHaveBeenCalledTimes(3);expect(max).toBe(2);q.dispose();
});
it('aborts departed paragraphs and ignores late results after disabling',async()=>{
 let signal!:AbortSignal,finish!:(v:any)=>void;const cache=createMeaningResultCache();
 const q=createMeaningGroupQueue((_text,s)=>{signal=s;return new Promise(resolve=>finish=resolve);},()=>{},cache);
 q.setVisible(['One.']);await flush();q.dispose();expect(signal.aborted).toBe(true);finish(result('One.'));await flush();expect(cache.stats().units).toBe(0);
});
it('does not retry malformed results every visibility tick but allows explicit retry',async()=>{
 const fetcher=vi.fn().mockRejectedValue(new Error('bad result'));const q=createMeaningGroupQueue(fetcher,()=>{});
 q.setVisible(['One.']);await flush();q.setVisible(['One.']);await flush();expect(fetcher).toHaveBeenCalledTimes(1);
 q.retry();await flush();expect(fetcher).toHaveBeenCalledTimes(2);q.dispose();
});
it('stops new paid requests when AI is unavailable or access denied',async()=>{
 const fetcher=vi.fn().mockRejectedValue(Object.assign(new Error('no AI'),{status:503}));const q=createMeaningGroupQueue(fetcher,()=>{});
 q.setVisible(['One.','Two.','Three.']);await flush();expect(fetcher).toHaveBeenCalledTimes(2);expect(q.status().blocked).toBe(true);q.dispose();
});

it('does not generate an endless redraw loop for unchanged viewport ticks',()=>{const changed=vi.fn();const q=createMeaningGroupQueue(async t=>result(t),changed);q.setVisible([]);q.setVisible([]);expect(changed).not.toHaveBeenCalled();q.dispose();});

it('processes all 35 visible units without premature completion',async()=>{
 const texts=Array.from({length:35},(_,i)=>`Visible paragraph ${i+1}.`);
 const q=createMeaningGroupQueue(async text=>result(text),()=>{});
 q.setVisible(texts);expect(q.status().pending).toBe(35);
 for(let i=0;i<250;i++)await Promise.resolve();
 expect(texts.filter(t=>q.get(t))).toHaveLength(35);
 expect(q.status().pending).toBe(0);q.dispose();
});
it('keeps limited units pending and automatically resumes at Retry-After',async()=>{
 vi.useFakeTimers();
 try{
  let calls=0;const q=createMeaningGroupQueue(async text=>{calls++;if(calls===1)throw {status:429,retryAfterMs:2000};return result(text);},()=>{});
  q.setVisible(['One.']);await flush();
  expect(q.status()).toMatchObject({pending:1,ready:0,failed:0,deferred:1,retryAt:Date.now()+2000});
  await vi.advanceTimersByTimeAsync(1999);expect(calls).toBe(1);
  await vi.advanceTimersByTimeAsync(1);await flush();expect(q.get('One.')).toEqual(result('One.'));q.dispose();
 }finally{vi.useRealTimers();}
});
it('bounds automatic rate-limit retries to 5, 15, 45 seconds and then requires explicit retry',async()=>{
 vi.useFakeTimers();
 try{
  let calls=0;const q=createMeaningGroupQueue(async()=>{calls++;throw {status:429};},()=>{});
  q.setVisible(['One.']);await flush();
  for(const ms of [5000,15000,45000]){expect(q.status().retryAt).toBe(Date.now()+ms);await vi.advanceTimersByTimeAsync(ms);await flush();}
  expect(calls).toBe(4);expect(q.status()).toMatchObject({blocked:true,retryAt:null});
  await vi.advanceTimersByTimeAsync(120000);expect(calls).toBe(4);
  q.retry();await flush();expect(calls).toBe(5);expect(q.status().retryAt).toBe(Date.now()+5000);q.dispose();
 }finally{vi.useRealTimers();}
});
it.each([0,999999])('clamps rate-limit header %s to 1–120 seconds',async retryAfterMs=>{
 vi.useFakeTimers();try{
  const q=createMeaningGroupQueue(async()=>{throw {status:429,retryAfterMs};},()=>{});
  q.setVisible(['One.']);await flush();expect(q.status().retryAt).toBe(Date.now()+(retryAfterMs===0?1000:120000));q.dispose();
 }finally{vi.useRealTimers();}
});
it('keeps rate history when no units remain and cancels timers only when disposed',async()=>{
 vi.useFakeTimers();try{
  let calls=0;const q=createMeaningGroupQueue(async()=>{calls++;throw {status:429};},()=>{});
  q.setVisible(['One.']);await flush();q.setVisible([]);await vi.advanceTimersByTimeAsync(10000);expect(calls).toBe(1);expect(q.status().retryAt).toBeNull();
  q.setVisible(['Two.']);await flush();expect(q.status().retryAt).toBe(Date.now()+15000);q.dispose();await vi.advanceTimersByTimeAsync(15000);expect(calls).toBe(2);
 }finally{vi.useRealTimers();}
});
it.each([401,403,503])('does not automatically retry status %s',async status=>{
 vi.useFakeTimers();try{
  let calls=0;const q=createMeaningGroupQueue(async()=>{calls++;throw {status};},()=>{});
  q.setVisible(['One.','Two.','Three.']);await flush();await vi.advanceTimersByTimeAsync(120000);
  expect(calls).toBe(2);expect(q.status().retryAt).toBeNull();expect(q.status().pending).toBeGreaterThan(0);q.dispose();
 }finally{vi.useRealTimers();}
});
it('parses bounded seconds and HTTP-date Retry-After headers and rejects malformed values',async()=>{
 const {meaningRetryAfterMs}=await import('@/components/reader/meaning-group-queue');
 const now=Date.UTC(2026,9,1);
 expect(meaningRetryAfterMs('17',now)).toBe(17000);
 expect(meaningRetryAfterMs(new Date(now+20000).toUTCString(),now)).toBe(20000);
 expect(meaningRetryAfterMs('0',now)).toBe(1000);expect(meaningRetryAfterMs('999999',now)).toBe(120000);
 expect(meaningRetryAfterMs('bad',now)).toBeUndefined();expect(meaningRetryAfterMs(null,now)).toBeUndefined();
});
it('preserves a healthy sibling response during rate limiting',async()=>{
 vi.useFakeTimers();try{
  let finish!:(value:any)=>void,secondSignal!:AbortSignal;
  const q=createMeaningGroupQueue((text,signal)=>text==='One.'?Promise.reject({status:429}):new Promise(resolve=>{finish=resolve;secondSignal=signal;}),()=>{});
  q.setVisible(['One.','Two.']);await flush();expect(secondSignal.aborted).toBe(false);
  finish(result('Two.'));await flush();expect(q.get('Two.')).toEqual(result('Two.'));expect(q.status().pending).toBe(1);q.dispose();
 }finally{vi.useRealTimers();}
});

it('bounds pending neighbor admission at sixteen units/19200 chars and refills after completion',async()=>{
 const budget=createReaderAIClientBudget({maxPrefetchStartsPerMinute:100}),pending=new Map<string,(v:any)=>void>(),cache=createMeaningResultCache();
 const q=newQueue({request:text=>new Promise(resolve=>pending.set(text,resolve)),changed:()=>{},budget,cache});
 const texts=Array.from({length:20},(_,i)=>`${i} `+'x'.repeat(1196-String(i).length)+'.');
 q.setWindow({visible:[],neighborhood:texts.map(text=>({unit:unit(text),distance:1 as const,direction:1 as const})),readingDirection:1});await flush();expect(q.status()).toMatchObject({prefetchPending:16,deferred:4});expect(budget.status()).toMatchObject({active:1,queued:15});
 pending.get(texts[0])!(result(texts[0]));await flush();expect(q.status()).toMatchObject({prefetchPending:16,prefetchReady:1,deferred:3});q.dispose();expect(budget.status().queued).toBe(0);budget.dispose();
});
it('batch swaps visible/neighbor without aborting promoted work, deduplicates equal keys and caches new positions',async()=>{
 const signals=new Map<string,AbortSignal>(),finish=new Map<string,(v:any)=>void>(),calls=vi.fn((text:string,s:AbortSignal)=>new Promise<any>(resolve=>{signals.set(text,s);finish.set(text,resolve);}));
 const budget=createReaderAIClientBudget(),cache=createMeaningResultCache(),q=newQueue({request:calls,changed:()=>{},budget,cache});
 q.setWindow({visible:[unit('One.')],neighborhood:[{unit:unit('Two.'),distance:1,direction:1}],readingDirection:1});await flush();
 q.setWindow({visible:[unit('Two.'),{...unit('Two.'),sourceId:'different',location:'new-CFI'}],neighborhood:[{unit:unit('One.'),distance:1,direction:-1}],readingDirection:1});expect(signals.get('Two.')!.aborted).toBe(false);expect(calls).toHaveBeenCalledTimes(2);
 finish.get('Two.')!(result('Two.'));await flush();q.setWindow({visible:[{...unit('Two.'),sourceId:'third',location:'third-CFI'}],neighborhood:[],readingDirection:1});expect(q.get('Two.')).toEqual(result('Two.'));expect(signals.get('One.')!.aborted).toBe(true);expect(calls).toHaveBeenCalledTimes(2);q.dispose();budget.dispose();
});
it('never resets finite 429 history across four different windows or empty ticks',async()=>{
 vi.useFakeTimers();try{let calls=0;const q=createMeaningGroupQueue(async()=>{calls++;throw {status:429};},()=>{});q.setVisible(['One.']);await flush();
 for(const [i,delay] of [5000,15000,45000].entries()){q.setVisible([]);q.setVisible([`Window ${i}.`]);expect(q.status().retryAt).toBe(Date.now()+delay);await vi.advanceTimersByTimeAsync(delay);await flush();}
 expect(calls).toBe(4);expect(q.status()).toMatchObject({pauseReason:'exhausted',retryAt:null});q.setVisible(['Another.']);await vi.advanceTimersByTimeAsync(300000);expect(calls).toBe(4);q.retry();await flush();expect(calls).toBe(5);q.dispose();}finally{vi.useRealTimers();}
});
it('bounds cumulative automatic waits at 180 seconds even with valid long headers',async()=>{
 vi.useFakeTimers();try{const q=createMeaningGroupQueue(async()=>{throw {status:429,retryAfterMs:120000};},()=>{});q.setVisible(['One.']);await flush();await vi.advanceTimersByTimeAsync(120000);await flush();expect(q.status()).toMatchObject({pauseReason:'exhausted',retryAt:null});q.dispose();}finally{vi.useRealTimers();}
});
it('suspends without losing completed cache or rate history and resumes without owning the shared budget',async()=>{
 const budget=createReaderAIClientBudget(),cache=createMeaningResultCache(),pending=new Map<string,(v:any)=>void>(),q=newQueue({request:text=>new Promise(resolve=>pending.set(text,resolve)),changed:()=>{},budget,cache});
 q.setVisible(['One.','Two.']);await flush();pending.get('One.')!(result('One.'));await flush();q.setSuspended(true);expect(budget.status().active).toBe(0);pending.get('Two.')!(result('Two.'));await flush();expect(q.get('Two.')).toBeUndefined();expect(q.get('One.')).toBeDefined();q.setSuspended(false);await flush();expect(budget.status().active).toBe(1);q.dispose();await expect(budget.submit({id:'external',kind:'semantic-flip',rank:0,run:async()=> 'ok'}).result).resolves.toBe('ok');budget.dispose();
});
it('never lets an invalid completed coverage enter the cache',async()=>{
 const q=createMeaningGroupQueue(async text=>({text,groups:[],verbs:[]}),()=>{});q.setVisible(['One.']);await flush();expect(q.status().failed).toBe(1);expect(q.get('One.')).toBeUndefined();q.dispose();
});
it('reapplies the neighbor pending cap when many queued visible units become pure neighbors',async()=>{
 const budget=createReaderAIClientBudget(),q=newQueue({request:()=>new Promise(()=>{}),changed:()=>{},budget,cache:createMeaningResultCache()});const units=Array.from({length:24},(_,i)=>unit(`Downgraded ${i}.`));
 q.setWindow({visible:units,neighborhood:[],readingDirection:1});await flush();expect(q.status().pending).toBe(24);q.setWindow({visible:[],neighborhood:units.map(unit=>({unit,distance:1 as const,direction:1 as const})),readingDirection:1});await flush();expect(q.status().prefetchPending).toBe(16);expect(budget.status().queued).toBe(15);q.dispose();budget.dispose();
});
