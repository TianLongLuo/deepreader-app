import {expect,it} from 'vitest';
import {JSDOM} from 'jsdom';
import {createTextProjection} from '@/components/reader/text-projection';
import {registerOriginalText} from '@/components/reader/original-text';
import {collectMeaningSources} from '@/components/reader/meaning-text-source';
it('keeps every source Text and offset unchanged while visually replacing only one occurrence',()=>{
 const doc=new JSDOM('<p>CAT after CAT.</p>',{url:'http://localhost'}).window.document,el=doc.querySelector('p')!,text=el.firstChild as Text;
 const p=createTextProjection(doc.documentElement,{layout:'stable'}),off=registerOriginalText(p),r=p.canonicalDocument.createRange();
 r.setStart(p.canonicalNode(text)!,0);r.setEnd(p.canonicalNode(text)!,3);
 p.apply({id:'cat',originalRange:r,replacement:'a much longer translated phrase'});
 expect(text.data).toBe('CAT after CAT.');expect(el.firstChild).toBe(text);
 expect(p.projectedRanges(r)[0].toString()).toBe('CAT');
 expect(doc.querySelector('[data-semantic-replacement]')?.getAttribute('data-semantic-replacement')).toBe('a much longer translated phrase');
 expect(doc.body.querySelector('[data-reader-projection-overlay]')).toBeNull();
 expect(collectMeaningSources(doc.body).map(s=>s.text)).toEqual(['CAT after CAT.']);
 const live=doc.createRange();live.setStart(text,0);live.setEnd(text,3);
 expect(p.occurrenceForLiveRange(live)).toBe('cat');live.setStart(text,10);live.setEnd(text,13);expect(p.occurrenceForLiveRange(live)).toBeNull();
 p.restore('cat');expect(doc.querySelector('[data-semantic-replacement]')).toBeNull();expect(text.data).toBe('CAT after CAT.');
 off();p.dispose();expect(doc.querySelector('[data-reader-projection-overlay]')).toBeNull();
});
it('keeps cross-inline original fragments unchanged and removes its visual layer on dispose',()=>{
 const doc=new JSDOM('<p>re<em>-en</em>ter after.</p>').window.document,p=createTextProjection(doc.documentElement,{layout:'stable'});
 const texts=[doc.querySelector('p')!.firstChild!,doc.querySelector('em')!.firstChild!,doc.querySelector('p')!.lastChild!];
 const r=p.canonicalDocument.createRange();r.setStart(p.canonicalNode(texts[0])!,0);r.setEnd(p.canonicalNode(texts[2])!,3);
 p.apply({id:'x',originalRange:r,replacement:'重新进入'});expect(texts.map(n=>n.textContent)).toEqual(['re','-en','ter after.']);p.dispose();
 expect(doc.querySelector('[data-reader-projection-overlay]')).toBeNull();
});
it('maps structural body end after auxiliary presentation nodes back to the exact source end',()=>{
 const doc=new JSDOM('<p>CAT after.</p>').window.document,p=createTextProjection(doc.documentElement,{layout:'stable'});
 const r=doc.createRange();r.selectNodeContents(doc.body);
 const original=p.originalRange(r);expect(original.toString()).toBe('CAT after.');expect(original.endOffset).toBe(p.canonicalDocument.body.childNodes.length);p.dispose();
});
it('keeps replacement masking above subsequently registered opaque word-hover highlights',()=>{
 const win=new JSDOM('<p>CAT.</p>').window,doc=win.document,registry=new Map<string,{priority:number}>();
 class HighlightFixture{priority=0;constructor(..._ranges:Range[]) {}}
 Object.defineProperty(win,'CSS',{value:{highlights:registry},configurable:true});Object.defineProperty(win,'Highlight',{value:HighlightFixture,configurable:true});
 const p=createTextProjection(doc.documentElement,{layout:'stable'}),r=p.canonicalDocument.createRange(),text=doc.querySelector('p')!.firstChild!;
 r.setStart(p.canonicalNode(text)!,0);r.setEnd(p.canonicalNode(text)!,3);p.apply({id:'cat',originalRange:r,replacement:'猫'});
 registry.set('reader-hover-word',new HighlightFixture());
 const mask=[...registry].find(([name])=>name.startsWith('reader-flip-'))![1];expect(mask.priority).toBeGreaterThan(registry.get('reader-hover-word')!.priority);p.dispose();
});
it('owns in-place waiting, completion and reverse-motion feedback without mutating original text',()=>{
 const doc=new JSDOM('<p>CAT after.</p>',{url:'http://localhost'}).window.document,p=createTextProjection(doc.documentElement,{layout:'stable'}),live=doc.querySelector('p')!.firstChild!;
 const r=p.canonicalDocument.createRange();r.setStart(p.canonicalNode(live)!,0);r.setEnd(p.canonicalNode(live)!,3);
 const cancel=p.pending({id:'cat',originalRange:r});expect(doc.querySelector('[data-semantic-state=pending]')).not.toBeNull();expect(live.textContent).toBe('CAT after.');expect(p.epoch).toBe(0);
 p.apply({id:'cat',originalRange:r,replacement:'猫'});cancel();expect(doc.querySelector('[data-semantic-state=complete]')).not.toBeNull();expect(doc.querySelector('[data-semantic-state=pending]')).toBeNull();
 p.restore('cat',{animate:true});expect(doc.querySelector('[data-semantic-state=restore]')).not.toBeNull();expect(live.textContent).toBe('CAT after.');p.dispose();expect(doc.querySelector('[data-reader-projection-overlay]')).toBeNull();
});
it('refreshes paused waiting feedback when the native parent scroll brings an iframe back onscreen',async()=>{
 const outer=new JSDOM('<iframe></iframe>',{url:'http://localhost',pretendToBeVisual:true}),frame=outer.window.document.querySelector('iframe')!,doc=frame.contentDocument!,win=doc.defaultView!;
 doc.body.innerHTML='<p>CAT.</p>';let top=1000;frame.getBoundingClientRect=()=>({left:0,right:360,top,bottom:top+1000,width:360,height:1000} as DOMRect);
 Object.defineProperty(win.Range.prototype,'getClientRects',{value:()=>[{left:10,top:20,right:40,bottom:40,width:30,height:20}]});
 const p=createTextProjection(doc.documentElement,{layout:'stable'}),r=p.canonicalDocument.createRange();r.setStart(p.canonicalDocument.querySelector('p')!.firstChild!,0);r.setEnd(r.startContainer,3);
 const off=p.pending({id:'cat',originalRange:r});expect(doc.querySelector<HTMLElement>('[data-semantic-slot]')!.style.animationPlayState).toBe('paused');
 top=0;outer.window.document.dispatchEvent(new outer.window.Event('scroll'));await new Promise(resolve=>setTimeout(resolve,30));
 expect(doc.querySelector<HTMLElement>('[data-semantic-slot]')!.style.animationPlayState).toBe('running');off();p.dispose();outer.window.close();
});
it('keeps source-masking paint static when the browser has no CSS Highlight support',()=>{
 const win=new JSDOM('<p>CAT.</p>').window,doc=win.document;Object.defineProperty(win.Range.prototype,'getClientRects',{value:()=>[{left:10,top:20,right:40,bottom:40,width:30,height:20}]});
 const p=createTextProjection(doc.documentElement,{layout:'stable'}),r=p.canonicalDocument.createRange();r.setStart(p.canonicalDocument.querySelector('p')!.firstChild!,0);r.setEnd(r.startContainer,3);
 const off=p.pending({id:'cat',originalRange:r}),slot=doc.querySelector<HTMLElement>('[data-semantic-slot]')!;expect(slot.style.animation).toBe('none');expect(slot.style.getPropertyPriority('animation')).toBe('important');off();p.dispose();
});
