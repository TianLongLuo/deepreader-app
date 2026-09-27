import {expect,it} from 'vitest';
import {startLookup} from '../src/components/reader/lookup-session';
it('publishes dictionary immediately and suppresses aborted context',async()=>{
 const events:unknown[]=[];let finish!:(x:unknown)=>void;
 const context=new Promise(resolve=>finish=resolve);const c=new AbortController();
 const job=startLookup({dictionary:async()=>({word:'light',meanings:[]}),context:()=>context,signal:c.signal},e=>events.push(e));
 await new Promise(r=>setTimeout(r,0));expect(events).toHaveLength(1);
 c.abort();finish({answer:'stale'});await job;expect(events).toHaveLength(1);
});
