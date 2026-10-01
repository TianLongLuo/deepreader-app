// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {createElement} from 'react';
import {cleanup,render,waitFor} from '@testing-library/react';
const consumer=vi.hoisted(()=>({consumeAIStream:vi.fn()}));vi.mock('@/lib/ai-stream',()=>consumer);
import EnrichmentProgress from '@/components/study/enrichment-progress';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('uses the latest completion guard so a late job cannot overwrite an in-progress manual edit',async()=>{
 let finish:()=>void=()=>{};const old=vi.fn(),current=vi.fn();consumer.consumeAIStream.mockImplementation(()=>new Promise(resolve=>{finish=()=>resolve({targetSenseId:'sense'});}));
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({status:'running',progress:{draft:'',stage:'generating'}})));
 const view=render(createElement(EnrichmentProgress,{id:'sense',onComplete:old}));await waitFor(()=>expect(consumer.consumeAIStream).toHaveBeenCalled());
 view.rerender(createElement(EnrichmentProgress,{id:'sense',onComplete:current}));finish();await waitFor(()=>expect(current).toHaveBeenCalledOnce());expect(old).not.toHaveBeenCalled();
});
