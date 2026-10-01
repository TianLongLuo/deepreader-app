import {expect,it} from 'vitest';
import {JSDOM} from 'jsdom';
import {collectMeaningSources,sourceRange} from '@/components/reader/meaning-text-source';
import {splitMeaningText,offsetMeaningResult} from '@/lib/meaning-group-units';
const documentFor=(html:string)=>new JSDOM(`<body>${html}</body>`).window.document;
it('covers direct parent text, nested paragraphs, and unmarked prose exactly once without DOM mutation',()=>{
 const doc=documentFor('<blockquote data-reader-interactive="true">Outside <em>direct</em> text.<p data-reader-interactive="true">Inside paragraph.</p>Tail.</blockquote><div class="book-prose">A div-only passage.</div><button>Reader control must not be sent.</button>');
 const before=doc.body.innerHTML,sources=collectMeaningSources(doc.body);
 expect(sources.map(s=>s.text)).toEqual(['Outside direct text.','Inside paragraph.','Tail.','A div-only passage.']);
 expect(doc.body.innerHTML).toBe(before);
 expect(sourceRange(sources[0],8,14).toString()).toBe('direct');
 const nodeIds=new Map<Text,number>();
 const identities=sources.flatMap(s=>s.points.filter((_,i)=>!/\s/.test(s.text[i])).map(p=>{if(!nodeIds.has(p.node))nodeIds.set(p.node,nodeIds.size);return `${nodeIds.get(p.node)}:${p.offset}`;}));
 expect(new Set(identities).size).toBe(identities.length);
});
it('collapses whitespace and br while preserving actual inline text nodes and UTF16 offsets',()=>{
 const doc=documentFor('<p>  Don\'t <em>re-enter</em><br>🙂 Señor\u0301 arrived. </p>');
 const source=collectMeaningSources(doc.body)[0];
 expect(source.text).toBe("Don't re-enter 🙂 Señor\u0301 arrived.");
 for(const word of ["Don't",'re-enter','🙂','Señor\u0301','arrived']){
  const start=source.text.indexOf(word);
  expect(sourceRange(source,start,start+word.length).toString()).toBe(word);
 }
 expect(()=>sourceRange(source,-1,2)).toThrow(RangeError);
 expect(()=>sourceRange(source,0,source.text.length+1)).toThrow(RangeError);
});
it('excludes hidden content, footnote controls, scripts, navigation and form controls',()=>{
 const doc=documentFor('<p>Read <a epub:type="noteref" href="#note">99</a> this.<span hidden>hidden</span><span aria-hidden="true">hidden</span><span style="display:none">hidden</span><span style="visibility:hidden">hidden</span><span> Visible.</span></p><nav>Navigation</nav><script>secret</script><style>css</style><input value="input"><textarea>textarea</textarea><select><option>option</option></select>');
 expect(collectMeaningSources(doc.body).map(s=>s.text)).toEqual(['Read this. Visible.']);
});
it('reads only PDF source buttons, not page headers, translation or other buttons',()=>{
 const doc=documentFor('<h1>File title</h1><div>Page 1</div><button data-pdf-selection-key="pdf:1"><span>The <span class="reader-action-underline">engine</span> started.</span></button><p>Chinese translation</p><button>Next page</button>');
 expect(collectMeaningSources(doc.body).map(s=>s.text)).toEqual(['The engine started.']);
});
it('maps units after a long paragraph split back to the original source including the tail',()=>{
 const doc=documentFor(`<p>${'She waited. '.repeat(600)}<em>He arrived.</em></p>`);
 const source=collectMeaningSources(doc.body)[0],units=splitMeaningText(source.text);
 const last=units.at(-1)!;
 const mapped=offsetMeaningResult({text:last.text,groups:[{text:last.text,start:0,end:last.text.length}],verbs:[]},last.start);
 expect(sourceRange(source,mapped.groups[0].start,mapped.groups[0].end).toString()).toBe(last.text);
 expect(last.end).toBe(source.text.length);
});
it('reconstructs ranges for new nodes when an identical paragraph is replaced',()=>{
 const doc=documentFor('<p>Same text.</p>'),first=collectMeaningSources(doc.body)[0];
 doc.body.innerHTML='<p>Same text.</p>';
 const second=collectMeaningSources(doc.body)[0];
 expect(first.text).toBe(second.text);expect(first.points[0].node).not.toBe(second.points[0].node);
 expect(sourceRange(second,0,second.text.length).startContainer.isConnected).toBe(true);
});
it('invalidates source mappings when book visibility or prose styles change without replacing nodes',async()=>{
 const {observeMeaningSources}=await import('@/components/reader/meaning-text-source');
 const doc=documentFor('<p>Visible book text.</p>');doc.body.hidden=true;
 let passages=collectMeaningSources(doc.body),changes=0;
 const observer=observeMeaningSources(doc.body,()=>{changes++;passages=collectMeaningSources(doc.body);});
 doc.body.hidden=false;await Promise.resolve();await Promise.resolve();
 expect(changes).toBe(1);expect(passages[0].text).toBe('Visible book text.');
 doc.querySelector('p')!.setAttribute('style','display:none');await Promise.resolve();expect(passages).toEqual([]);observer.disconnect();
});
it('ignores UI mutations outside the observed reading body',async()=>{
 const {observeMeaningSources}=await import('@/components/reader/meaning-text-source');
 const doc=documentFor('<main><p>Book text.</p></main><aside>Tool</aside>');let changes=0;
 const observer=observeMeaningSources(doc.querySelector('main')!,()=>{changes++;});
 doc.querySelector('aside')!.textContent='Draft';await Promise.resolve();expect(changes).toBe(0);observer.disconnect();
});
it('handles lowercase XHTML book tags and br without including navigation or scripts',()=>{
 const doc=new JSDOM('<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Book</title></head><body><p>Read<br/>this <a epub:type="noteref">99</a> text.</p><nav>Skip navigation</nav><script>secret</script><button>Skip control</button></body></html>',{contentType:'application/xhtml+xml'}).window.document;
 expect(collectMeaningSources(doc.body).map(s=>s.text)).toEqual(['Read this text.']);
});
