// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,renderHook,waitFor} from '@testing-library/react';
import {useSemanticFlip} from '@/hooks/use-semantic-flip';
import {createReaderAIClientBudget} from '@/components/reader/reader-ai-budget';
import type {Occurrence} from '@/components/reader/source-position';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const domain={documentId:'book',sourceLanguage:'en',targetLanguage:'zh',aiEpoch:'one'} as const;
const occurrence=():Occurrence=>{const r=document.createRange();document.body.append(document.createTextNode('CAT'));r.selectNodeContents(document.body.lastChild!);return {id:'cat',position:{kind:'pdf',selectionKey:'p',start:0,end:3},word:'CAT',originalRange:r};};
const inputFor=()=>({...domain,sourceText:'CAT after CAT.',start:0,end:3,targetWord:'CAT',occurrence:'cat'});
it('applies only a validated completion and restores without another request',async()=>{
 const fetcher=vi.fn(async()=>new Response([JSON.stringify({type:'start',requestId:'r',cached:false}),JSON.stringify({type:'delta',requestId:'r',text:'{"replacement":"猫"}'}),JSON.stringify({type:'complete',requestId:'r',value:{replacement:'猫',provider:'fixture',model:'fixture'}})].join('\n'),{headers:{'Content-Type':'application/x-ndjson'}}));vi.stubGlobal('fetch',fetcher);
 const apply=vi.fn(async()=>{}),restore=vi.fn(async()=>{}),restoreAll=vi.fn(async()=>{}),budget=createReaderAIClientBudget();const {result}=renderHook(()=>useSemanticFlip({enabled:true,ready:true,domain,budget,inputFor,apply,restore,restoreAll}));
 act(()=>result.current.click(occurrence()));await waitFor(()=>expect(apply).toHaveBeenCalledTimes(1));expect(result.current.lastChange).toEqual({original:'CAT',replacement:'猫'});
 act(()=>result.current.click(occurrence()));await waitFor(()=>expect(restore).toHaveBeenCalledWith('cat'));expect(fetcher).toHaveBeenCalledTimes(1);budget.dispose();
});
it('configuration failure pauses shared work until explicit retry and keeps the original',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:503})));const apply=vi.fn(async()=>{}),budget=createReaderAIClientBudget();const {result}=renderHook(()=>useSemanticFlip({enabled:true,ready:true,domain,budget,inputFor,apply,restore:async()=>{},restoreAll:async()=>{}}));act(()=>result.current.click(occurrence()));await waitFor(()=>expect(result.current.message).toContain('重试'));expect(budget.status().paused).toBe(true);expect(apply).not.toHaveBeenCalled();act(()=>result.current.retry());expect(budget.status().paused).toBe(false);budget.dispose();
});
it('disabling and changing the epoch clears records, cancels work and restores source',async()=>{
 const restoreAll=vi.fn(async()=>{}),budget=createReaderAIClientBudget();vi.stubGlobal('fetch',vi.fn((_u,_o)=>new Promise(()=>{})));
 const {result,rerender}=renderHook(({enabled,epoch})=>useSemanticFlip({enabled,ready:true,domain:{...domain,aiEpoch:epoch},budget,inputFor,apply:async()=>{},restore:async()=>{},restoreAll}),{initialProps:{enabled:true,epoch:'one'}});act(()=>result.current.click(occurrence()));rerender({enabled:false,epoch:'one'});await waitFor(()=>expect(restoreAll).toHaveBeenCalled());expect(result.current.completed()).toEqual([]);rerender({enabled:true,epoch:'two'});await waitFor(()=>expect(budget.status().active).toBe(0));budget.dispose();
});
it('offers an explicit retry when another reading feature has paused the shared budget',()=>{
 const budget=createReaderAIClientBudget();budget.pause('configuration');const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);const {result}=renderHook(()=>useSemanticFlip({enabled:true,ready:true,domain,budget,inputFor,apply:async()=>{},restore:async()=>{},restoreAll:async()=>{}}));act(()=>result.current.click(occurrence()));expect(result.current.message).toContain('重试');expect(result.current.pending).toBe(0);expect(fetcher).not.toHaveBeenCalled();act(()=>result.current.retry());expect(budget.status().paused).toBe(false);budget.dispose();
});
