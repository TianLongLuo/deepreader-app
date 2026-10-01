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
