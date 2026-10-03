import {afterEach,expect,it,vi} from 'vitest';
import {JSDOM} from 'jsdom';
import {createSemanticHover,partOfSpeechLabel} from '@/components/reader/semantic-hover';
afterEach(()=>vi.useRealTimers());
it('debounces cached local POS lookup and ignores stale hover responses without AI calls',async()=>{
 vi.useFakeTimers();const doc=new JSDOM('<p>CAT after CAT.</p>',{url:'http://localhost'}).window.document,p=doc.querySelector('p')!;
 const request=vi.fn(async()=>({parts:['noun']})),h=createSemanticHover(doc,{lookup:request});
 h.show({word:'CAT',language:'en',rect:{left:10,top:20,right:40,bottom:40}});h.clear();await vi.advanceTimersByTimeAsync(400);expect(request).not.toHaveBeenCalled();
 h.show({word:'CAT',language:'en',rect:{left:10,top:20,right:40,bottom:40}});await vi.advanceTimersByTimeAsync(400);expect(request).toHaveBeenCalledTimes(1);
 expect(doc.querySelector('[data-semantic-hover]')?.textContent).toContain('名词 · noun');
 expect(Boolean(doc.body.querySelector('[data-semantic-hover]'))).toBe(false);
 h.clear();expect(doc.querySelector<HTMLElement>('[data-semantic-hover]')!.style.getPropertyValue('display')).toBe('none');expect(doc.querySelector<HTMLElement>('[data-semantic-hover]')!.style.getPropertyPriority('display')).toBe('important');h.show({word:'CAT',language:'en',rect:{left:20,top:30,right:50,bottom:50}});expect(request).toHaveBeenCalledTimes(1);
 h.dispose();expect(doc.querySelector('[data-semantic-hover]')).toBeNull();
});
it('shows full replacement on hover and does not invent missing context-specific POS',async()=>{
 vi.useFakeTimers();const doc=new JSDOM('<p>word</p>').window.document,h=createSemanticHover(doc,{lookup:async()=>({parts:['verb','noun']})});
 h.show({word:'bank',language:'en',replacement:'very long translated expression',rect:{left:5,top:8,right:20,bottom:28}});
 expect(doc.querySelector('[data-semantic-hover]')?.textContent).toContain('very long translated expression');
 await vi.advanceTimersByTimeAsync(400);expect(doc.querySelector('[data-semantic-hover]')?.textContent).toContain('词典词性');
 expect(partOfSpeechLabel(['adverb'])).toBe('副词 · adverb');h.dispose();
});
