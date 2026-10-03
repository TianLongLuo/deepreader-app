import {afterEach,expect,it} from 'vitest';
import {JSDOM} from 'jsdom';
import {createTextProjection} from '@/components/reader/text-projection';
import {originalText,originalRange,projectedRanges,projectionFor,readOriginalSelection,registerOriginalText} from '@/components/reader/original-text';
import {collectMeaningSources,sourceRange} from '@/components/reader/meaning-text-source';
const cleanup:Array<()=>void>=[];afterEach(()=>{cleanup.splice(0).reverse().forEach(fn=>fn());});
it('collects canonical UTF-16 text while taking hidden rules from the live document',()=>{
 const doc=new JSDOM('<p>She waited.</p><p hidden>Hidden.</p>').window.document;
 const p=createTextProjection(doc.documentElement);cleanup.push(()=>p.dispose(),registerOriginalText(p));
 const source=collectMeaningSources(doc.body)[0],verb=sourceRange(source,4,10);
 p.apply({id:'v',originalRange:verb,replacement:'was standing by'});
 expect(collectMeaningSources(doc.body).map(s=>s.text)).toEqual(['She waited.']);
 expect(projectedRanges(verb).map(r=>r.toString())).toEqual(['was standing by']);
 expect(originalText(doc.body)).toBe('She waited.Hidden.');
 expect(originalRange(projectedRanges(verb)[0]).toString()).toBe('waited');
 const off=registerOriginalText(p);off();expect(projectionFor(source.points[0].node)).toBe(p);
});
it('copies original text across PDF roots with block boundaries, emoji, accents and BR',()=>{
 const doc=new JSDOM('<main><div data-pdf-selection-key="a">CAT 😀<br>café</div><div data-pdf-selection-key="b">DOG.</div></main>').window.document;
 for(const root of doc.querySelectorAll('div')){
  const p=createTextProjection(root);cleanup.push(()=>p.dispose(),registerOriginalText(p));
  const source=collectMeaningSources(root)[0];p.apply({id:root.dataset.pdfSelectionKey!,originalRange:sourceRange(source,0,3),replacement:'a much longer animal'});
 }
 const r=doc.createRange();r.selectNodeContents(doc.querySelector('main')!);
 expect(readOriginalSelection(r)).toBe('CAT 😀\ncafé\nDOG.');
 expect(originalText(doc.querySelector('main')!)).toBe('CAT 😀caféDOG.');
});
it('unregisters live and canonical lookup without affecting another root',()=>{
 const doc=new JSDOM('<p>one</p><p>two</p>').window.document;
 const [one,two]=[...doc.querySelectorAll('p')].map(el=>createTextProjection(el));
 const off=registerOriginalText(one),off2=registerOriginalText(two);cleanup.push(()=>one.dispose(),()=>two.dispose(),off2);
 const canonical=one.canonicalNode(one.liveRoot.firstChild!)!;
 expect(projectionFor(canonical)).toBe(one);off();off();
 expect(projectionFor(canonical)).toBeUndefined();expect(projectionFor(two.liveRoot.firstChild!)).toBe(two);
});
it('copies only paired PDF prose when selection crosses intervening reader controls',()=>{
 const doc=new JSDOM('<main><button data-pdf-selection-key="a">First CAT.</button><button>段落分析</button><button data-pdf-selection-key="b">Second CAT.</button></main>').window.document,blocks=doc.querySelectorAll('[data-pdf-selection-key]');const projections=Array.from(blocks,b=>createTextProjection(b)),offs=projections.map(registerOriginalText),r=doc.createRange();r.setStart(blocks[0].firstChild!,0);r.setEnd(blocks[1].firstChild!,11);expect(readOriginalSelection(r)).toBe('First CAT.\nSecond CAT.');offs.forEach(off=>off());projections.forEach(p=>p.dispose());
});
