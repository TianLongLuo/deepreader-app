import {expect,it} from 'vitest';
import {JSDOM} from 'jsdom';
import {collectMeaningSources} from '@/components/reader/meaning-text-source';
it('retains mixed parent text without duplicating child paragraphs',()=>{
 const doc=new JSDOM('<blockquote>Before<p>Child</p>After</blockquote>').window.document;
 expect(collectMeaningSources(doc.body).map(s=>s.text)).toEqual(['Before','Child','After']);
});
it('invalidates ranges when identical repeated text moves to different visible nodes',async()=>{
 const {sameMeaningElements}=await import('@/components/reader/meaning-group-highlights');
 const a={} as HTMLElement,b={} as HTMLElement;
 expect(sameMeaningElements([a],[a])).toBe(true);expect(sameMeaningElements([a],[b])).toBe(false);
});
