import {expect,it} from 'vitest';
import {meaningParagraphElements} from '@/components/reader/meaning-group-highlights';
it('uses non-overlapping leaf reading paragraphs instead of sending nested containers twice',()=>{
 const child={querySelector:()=>null},parent={querySelector:()=>child};
 const root={querySelectorAll:()=>[parent,child]} as unknown as Element;
 expect(meaningParagraphElements(root)).toEqual([child]);
});
it('invalidates ranges when identical repeated text moves to different visible nodes',async()=>{
 const {sameMeaningElements}=await import('@/components/reader/meaning-group-highlights');
 const a={} as HTMLElement,b={} as HTMLElement;
 expect(sameMeaningElements([a],[a])).toBe(true);expect(sameMeaningElements([a],[b])).toBe(false);
});
