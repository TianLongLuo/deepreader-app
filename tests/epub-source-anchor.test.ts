// @vitest-environment jsdom
import {expect,it} from 'vitest';
import {EpubCFI} from 'epubjs';
import {epubSourceAnchorRange} from '@/components/reader/epub-source-anchor';
import {createTextProjection} from '@/components/reader/text-projection';
import {createCanonicalCfiScope} from '@/components/reader/scoped-cfi-adapter';
it.each(['<img id="cover" src="cover.svg"/>','<svg id="cover"><image href="cover.svg"/></svg>'])('opens an image-only section with a source-safe structural anchor: %s',html=>{
 document.body.innerHTML=html;const projection=createTextProjection(document.documentElement),scope=createCanonicalCfiScope(EpubCFI),off=scope.register(projection);
 try{const range=epubSourceAnchorRange(document.body);expect(range).not.toBeNull();const cfi=new EpubCFI(range!.startContainer,'/6/2');expect(cfi.spinePos).toBe(0);const live=cfi.toRange(document);expect(live.startContainer).toBe(document.querySelector('#cover'));expect(live.collapsed).toBe(true);}finally{off();scope.dispose();projection.dispose();}
});
it('uses following prose for an empty fragment without crossing its requested section',()=>{
 document.body.innerHTML='<p>previous text</p><a id="chapter-start"></a><p>Requested text</p>';
 const range=epubSourceAnchorRange(document.querySelector('#chapter-start')!);expect(range).not.toBeNull();expect(range!.startContainer.textContent).toBe('Requested text');expect(range!.startOffset).toBe(0);
});
it('preserves the source element for a final empty fragment',()=>{
 document.body.innerHTML='<p>previous text</p><a id="chapter-end"></a>';const range=epubSourceAnchorRange(document.querySelector('#chapter-end')!);expect(range?.startContainer).toBe(document.querySelector('#chapter-end'));
});
