import {afterEach,expect,it,vi} from 'vitest';
import {createReaderAIClientBudget} from '@/components/reader/reader-ai-budget';
const deferred=<T>()=>{let resolve!:(v:T)=>void,reject!:(v:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
afterEach(()=>vi.useRealTimers());
it('promotes all classifications before preempting only a genuine prefetch',async()=>{
 const b=createReaderAIClientBudget(),signals=new Map<string,AbortSignal>();const never=(id:string)=>(s:AbortSignal)=>{signals.set(id,s);return new Promise<string>(()=>{});};
 const a=b.submit({id:'a',kind:'meaning-visible',rank:0,run:never('a')}),c=b.submit({id:'b',kind:'meaning-prefetch',rank:1,run:never('b')});void a.result.catch(()=>{});void c.result.catch(()=>{});
 b.updateMany([{id:'a',kind:'meaning-prefetch',rank:1},{id:'b',kind:'meaning-visible',rank:0}]);
 await expect(b.submit({id:'click',kind:'semantic-flip',rank:0,run:async()=> 'done'}).result).resolves.toBe('done');
 expect(signals.get('b')!.aborted).toBe(false);expect(signals.get('a')!.aborted).toBe(true);b.dispose();
});
it('synchronously releases a canceled never-settling slot and ignores old same-id settlement',async()=>{
 const b=createReaderAIClientBudget({maxActive:1}),old=deferred<string>(),current=deferred<string>();
 const first=b.submit({id:'same',kind:'meaning-visible',rank:0,run:()=>old.promise});const rejected=expect(first.result).rejects.toMatchObject({name:'AbortError'});first.cancel();expect(b.status().active).toBe(0);
 const second=b.submit({id:'same',kind:'semantic-flip',rank:0,run:()=>current.promise});old.reject(new Error('late failure'));await rejected;await Promise.resolve();await Promise.resolve();expect(b.status().active).toBe(1);current.resolve('new');await expect(second.result).resolves.toBe('new');expect(b.status().active).toBe(0);b.dispose();
});
it('replaces an old same-id ticket without letting its late success complete the new ticket',async()=>{
 const b=createReaderAIClientBudget(),old=deferred<string>(),current=deferred<string>();const first=b.submit({id:'same',kind:'meaning-prefetch',rank:0,run:()=>old.promise});void first.result.catch(()=>{});
 const second=b.submit({id:'same',kind:'meaning-visible',rank:0,run:()=>current.promise});old.resolve('old');await Promise.resolve();expect(b.status().active).toBe(1);current.resolve('new');await expect(second.result).resolves.toBe('new');b.dispose();
});
it('limits eight pure prefetch starts in rolling 60 seconds but allows foreground work',async()=>{
 vi.useFakeTimers();const b=createReaderAIClientBudget();for(let i=0;i<8;i++)await b.submit({id:'p'+i,kind:'meaning-prefetch',rank:1,run:async()=>i}).result;
 let ninth=false;const waiting=b.submit({id:'p8',kind:'meaning-prefetch',rank:1,run:async()=>{ninth=true;return 8;}});expect(b.status()).toMatchObject({active:0,queued:1,prefetchRetryAt:Date.now()+60000});
 await expect(b.submit({id:'click',kind:'semantic-flip',rank:0,run:async()=> 'ok'}).result).resolves.toBe('ok');expect(ninth).toBe(false);await vi.advanceTimersByTimeAsync(59999);expect(ninth).toBe(false);await vi.advanceTimersByTimeAsync(1);await expect(waiting.result).resolves.toBe(8);b.dispose();expect(vi.getTimerCount()).toBe(0);
});
it('does not refund canceled starts or count promotion as another prefetch start',async()=>{
 vi.useFakeTimers();const b=createReaderAIClientBudget({maxPrefetchStartsPerMinute:1});const p=b.submit({id:'pref',kind:'meaning-prefetch',rank:1,run:()=>new Promise<void>(()=>{})});void p.result.catch(()=>{});b.updateMany([{id:'pref',kind:'meaning-visible',rank:0}]);p.cancel();
 const waiting=b.submit({id:'other',kind:'meaning-prefetch',rank:1,run:async()=> 'done'});expect(b.status().queued).toBe(1);await vi.advanceTimersByTimeAsync(60000);await waiting.result;b.dispose();
});
it('pauses new work without aborting a healthy sibling and resumes queued priority order',async()=>{
 const b=createReaderAIClientBudget(),healthy=deferred<string>(),order:string[]=[];let signal!:AbortSignal;const a=b.submit({id:'a',kind:'meaning-visible',rank:0,run:s=>{signal=s;return healthy.promise;}});b.pause('rate',Date.now()+5000);
 const p=b.submit({id:'p',kind:'meaning-prefetch',rank:1,run:async()=>{order.push('p');return 'p';}}),c=b.submit({id:'c',kind:'semantic-flip',rank:0,run:async()=>{order.push('c');return 'c';}});
 expect(signal.aborted).toBe(false);healthy.resolve('a');await a.result;expect(b.status()).toMatchObject({paused:true,active:0,queued:2});b.resume();await c.result;await p.result;expect(order).toEqual(['c','p']);b.dispose();
});
it('waits when both slots contain foreground jobs and enforces one active pure prefetch',async()=>{
 const b=createReaderAIClientBudget(),one=deferred<string>(),two=deferred<string>();const a=b.submit({id:'a',kind:'meaning-visible',rank:0,run:()=>one.promise}),c=b.submit({id:'b',kind:'semantic-flip',rank:0,run:()=>two.promise});
 const d=b.submit({id:'c',kind:'semantic-flip',rank:0,run:async()=> 'c'});expect(b.status()).toMatchObject({active:2,queued:1});one.resolve('a');await a.result;await d.result;two.resolve('b');await c.result;
 const p=b.submit({id:'p',kind:'meaning-prefetch',rank:1,run:()=>new Promise<void>(()=>{})}),q=b.submit({id:'q',kind:'meaning-prefetch',rank:2,run:async()=>{}});void p.result.catch(()=>{});void q.result.catch(()=>{});expect(b.status()).toMatchObject({active:1,prefetchActive:1,queued:1});b.dispose();
});
it('disposes all queues, timers and active slots without accepting new work',async()=>{
 vi.useFakeTimers();const b=createReaderAIClientBudget({maxPrefetchStartsPerMinute:1});await b.submit({id:'p',kind:'meaning-prefetch',rank:1,run:async()=>{}}).result;
 const queued=b.submit({id:'q',kind:'meaning-prefetch',rank:1,run:async()=>{}});const rejection=expect(queued.result).rejects.toMatchObject({name:'AbortError'});expect(vi.getTimerCount()).toBe(1);b.dispose();await rejection;expect(vi.getTimerCount()).toBe(0);expect(b.status()).toMatchObject({active:0,queued:0});await expect(b.submit({id:'late',kind:'semantic-flip',rank:0,run:async()=>{}}).result).rejects.toMatchObject({name:'AbortError'});
});
it('lets the response owner pause on a failed foreground request before starting the next queued job',async()=>{
 const b=createReaderAIClientBudget({maxActive:1});let later=false;const first=b.submit({id:'failure',kind:'meaning-visible',rank:0,run:async()=>{throw {status:503};}});void first.result.catch(()=>b.pause('configuration'));
 const next=b.submit({id:'next',kind:'meaning-visible',rank:0,run:async()=>{later=true;return 'later';}});void next.result.catch(()=>{});for(let i=0;i<8;i++)await Promise.resolve();expect(later).toBe(false);expect(b.status()).toMatchObject({paused:true,queued:1});b.dispose();
});
it('does not resume a shared configuration/rate gate when only one owner releases its pause',async()=>{
 const b=createReaderAIClientBudget(),releaseRate=b.pause('rate',Date.now()+5000),releaseConfiguration=b.pause('configuration');const ticket=b.submit({id:'shared',kind:'semantic-flip',rank:0,run:async()=> 'done'});releaseRate();expect(b.status().paused).toBe(true);releaseConfiguration();await expect(ticket.result).resolves.toBe('done');b.dispose();
});
