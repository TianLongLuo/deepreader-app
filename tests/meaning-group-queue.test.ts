import {expect,it,vi} from 'vitest';
import {createMeaningGroupQueue} from '@/components/reader/meaning-group-queue';
import {alignMeaningGroups} from '@/lib/meaning-groups';
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
 let signal!:AbortSignal,finish!:(v:any)=>void;const cache=new Map();
 const q=createMeaningGroupQueue((_text,s)=>{signal=s;return new Promise(resolve=>finish=resolve);},()=>{},cache);
 q.setVisible(['One.']);await flush();q.dispose();expect(signal.aborted).toBe(true);finish(result('One.'));await flush();expect(cache.size).toBe(0);
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
it('cancels rate-limit timers when no units remain or when disposed',async()=>{
 vi.useFakeTimers();try{
  let calls=0;const q=createMeaningGroupQueue(async()=>{calls++;throw {status:429};},()=>{});
  q.setVisible(['One.']);await flush();q.setVisible([]);await vi.advanceTimersByTimeAsync(10000);expect(calls).toBe(1);expect(q.status().retryAt).toBeNull();
  q.setVisible(['Two.']);await flush();q.dispose();await vi.advanceTimersByTimeAsync(10000);expect(calls).toBe(2);
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
it('does not cache a sibling response canceled by rate limiting',async()=>{
 vi.useFakeTimers();try{
  let finish!:(value:any)=>void,secondSignal!:AbortSignal;
  const q=createMeaningGroupQueue((text,signal)=>text==='One.'?Promise.reject({status:429}):new Promise(resolve=>{finish=resolve;secondSignal=signal;}),()=>{});
  q.setVisible(['One.','Two.']);await flush();expect(secondSignal.aborted).toBe(true);
  finish(result('Two.'));await flush();expect(q.get('Two.')).toBeUndefined();expect(q.status().pending).toBe(2);q.dispose();
 }finally{vi.useRealTimers();}
});
