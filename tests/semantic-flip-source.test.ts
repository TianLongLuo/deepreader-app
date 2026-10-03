import {expect,it} from 'vitest';
import {JSDOM} from 'jsdom';
import {createTextProjection} from '@/components/reader/text-projection';
import {registerOriginalText} from '@/components/reader/original-text';
import {flipInputFor,pdfOccurrence,sourceRangeAt} from '@/components/reader/semantic-flip-source';
it('keeps exact raw offsets for repeated cross-inline words after projection',()=>{
 const doc=new JSDOM('<button data-pdf-selection-key="p">CAT after C<b>A</b>T.</button>').window.document,block=doc.querySelector('button')!;
 const p=createTextProjection(block),off=registerOriginalText(p);const r=sourceRangeAt(p.canonicalNode(block)!,10,13);const o=pdfOccurrence('p',block,r);p.apply({id:o.id,originalRange:r,replacement:'a feline animal'});
 const input=flipInputFor(o,{documentId:'d',sourceLanguage:'en',targetLanguage:'zh',aiEpoch:'e'});expect(input.sourceText).toBe('CAT after CAT.');expect(input.start).toBe(10);expect(input.end).toBe(13);expect(input.targetWord).toBe('CAT');off();p.dispose();
});
