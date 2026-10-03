import {expect,it} from 'vitest';
import {JSDOM} from 'jsdom';
import {createTextProjection} from '@/components/reader/text-projection';
const span=(doc:Document,startNode:Node,start:number,end:number,endNode=startNode)=>{const r=doc.createRange();r.setStart(startNode,start);r.setEnd(endNode,end);return r;};
it('keeps original strings and live node identities while composing independent edits',()=>{
 const doc=new JSDOM('<p>CAT after CAT.</p>').window.document,p=createTextProjection(doc.documentElement);
 const live=doc.querySelector('p')!.firstChild as Text,original=p.canonicalNode(live)!;
 p.apply({id:'first',originalRange:span(p.canonicalDocument,original,0,3),replacement:'small animal'});
 expect(live.data).toBe('small animal after CAT.');expect(doc.querySelector('p')!.firstChild).toBe(live);
 expect(p.originalText(doc.querySelector('p')!)).toBe('CAT after CAT.');
 expect(p.projectedRanges(span(p.canonicalDocument,original,4,9)).map(r=>r.toString())).toEqual(['after']);
 p.apply({id:'second',originalRange:span(p.canonicalDocument,original,10,13),replacement:'pet'});
 p.restore('first');expect(live.data).toBe('CAT after pet.');
 p.dispose();p.dispose();expect(live.data).toBe('CAT after CAT.');
});
it('projects a cross-inline occurrence into its first fragment and restores all original nodes',()=>{
 const doc=new JSDOM('<p>re<em>-en</em>ter re-enter.</p>').window.document,p=createTextProjection(doc.documentElement);
 const el=doc.querySelector('p')!,nodes=[el.firstChild,el.querySelector('em')!.firstChild,el.lastChild] as Text[];
 const originals=nodes.map(n=>p.canonicalNode(n)!);
 const r=span(p.canonicalDocument,originals[0],0,3,originals[2]);
 p.apply({id:'word',originalRange:r,replacement:'enter again'});
 expect(nodes.map(n=>n.data)).toEqual(['enter again','',' re-enter.']);
 expect(p.originalText(el)).toBe('re-enter re-enter.');
 expect(p.occurrenceForLiveRange(span(doc,nodes[0],0,11))).toBe('word');
 expect(p.occurrenceForLiveRange(span(doc,nodes[0],4,7))).toBe('word');
 expect(p.occurrenceForLiveRange(span(doc,nodes[0],0,2,nodes[2]))).toBeNull();
 expect(p.projectedRanges(r).map(x=>x.toString())).toEqual(['enter again']);
 p.restore('word');expect(nodes.map(n=>n.data)).toEqual(['re','-en','ter re-enter.']);
 expect(el.firstChild).toBe(nodes[0]);expect(el.lastChild).toBe(nodes[2]);p.dispose();
});
it('preserves combining accents, surrogate pairs and atomic selection expansion',()=>{
 const doc=new JSDOM('<p>🙂 Señor\u0301 don’t re-enter</p>').window.document,p=createTextProjection(doc.documentElement);
 const live=doc.querySelector('p')!.firstChild as Text,canonical=p.canonicalNode(live)!;
 p.apply({id:'eye',originalRange:span(p.canonicalDocument,canonical,0,2),replacement:'smile'});
 expect(p.originalRange(span(doc,live,1,4)).toString()).toBe('🙂');
 expect(p.originalText(elRange(doc,doc.querySelector('p')!))).toBe('🙂 Señor\u0301 don’t re-enter');
 const html=doc.body.innerHTML;
 expect(()=>p.apply({id:'bad',originalRange:span(p.canonicalDocument,canonical,1,2),replacement:'x'})).toThrow();
 expect(doc.body.innerHTML).toBe(html);p.dispose();
});
function elRange(doc:Document,el:Element){const r=doc.createRange();r.selectNodeContents(el);return r;}
it('notifies one projection epoch for a cross-node edit and releases listeners',()=>{
 const doc=new JSDOM('<p>A <b>CAT</b> after.</p>').window.document,p=createTextProjection(doc.body);
 const canonical=p.canonicalDocument.querySelector('b')!.firstChild!;const epochs:number[]=[];
 const off=p.subscribe(e=>epochs.push(e));
 p.apply({id:'cat',originalRange:span(p.canonicalDocument,canonical,0,3),replacement:'longer pet'});
 expect(epochs).toEqual([1]);off();p.restore('cat');expect(epochs).toEqual([1]);p.dispose();
});
it('does not create cross-document ranges for an unrelated source',()=>{
 const a=new JSDOM('<p>one</p>').window.document,b=new JSDOM('<p>two</p>').window.document;
 const p=createTextProjection(a.documentElement);
 expect(()=>p.originalRange(span(b,b.querySelector('p')!.firstChild!,0,3))).toThrow();p.dispose();
});

it('keeps body offsets stable when the EPUB engine adds or changes head styles',()=>{
 const doc=new JSDOM('<html><head><style>body{color:red}</style></head><body><p>CAT after.</p></body></html>').window.document;
 const p=createTextProjection(doc.documentElement);
 try{
  const live=doc.querySelector('p')!.firstChild as Text,canonical=p.canonicalNode(live) as Text;
  doc.querySelector('style')!.textContent='body{color:blue;font-size:30px}';
  const style=doc.createElement('style');style.textContent='::highlight(x){background:red}';doc.head.appendChild(style);
  const r=p.canonicalDocument.createRange();r.setStart(canonical,0);r.setEnd(canonical,3);
  p.apply({id:'cat',originalRange:r,replacement:'small animal'});
  const after=doc.createRange();after.setStart(live,13);after.setEnd(live,18);
  expect(p.originalRange(after).toString()).toBe('after');
  expect(doc.querySelector('style')!.textContent).toBe('body{color:blue;font-size:30px}');
 }finally{p.dispose();}
});
it('preserves the owning prose Text at adjacent block boundaries when round-tripping a CFI range',()=>{
 const doc=new JSDOM('<h1>Chapter</h1><p>CAT after CAT.</p>').window.document,p=doc.querySelector('p')!,projection=createTextProjection(doc.documentElement),live=doc.createRange();live.setStart(p.firstChild!,0);live.setEnd(p.firstChild!,3);const original=projection.originalRange(live);
 expect(original.startContainer.parentElement?.tagName).toBe('P');expect(original.toString()).toBe('CAT');projection.dispose();
});
it('preserves a collapsed canonical block-start anchor instead of collapsing into the previous block',()=>{
 const doc=new JSDOM('<p>Previous.</p><p>She waits.</p>').window.document,p=createTextProjection(doc.documentElement),live=doc.querySelectorAll('p')[1].firstChild as Text,original=p.canonicalNode(live)!;
 const anchor=span(p.canonicalDocument,original,0,0);let projected=p.projectedRanges(anchor)[0];
 expect(projected.collapsed).toBe(true);expect(projected.startContainer.isSameNode(live)).toBe(true);expect(projected.startOffset).toBe(0);
 const previous=p.canonicalDocument.querySelector('p')!.firstChild!;p.apply({id:'prior',originalRange:span(p.canonicalDocument,previous,0,8),replacement:'A much longer previous phrase'});
 projected=p.projectedRanges(anchor)[0];expect(projected.startContainer.isSameNode(live)).toBe(true);expect(projected.startOffset).toBe(0);p.dispose();
});
