// @vitest-environment jsdom
import {expect,it} from 'vitest';
import {canFlipPointer} from '@/components/reader/flip-pointer-guard';
it('rejects the trailing pointer click of a selection gesture in either reader',()=>{document.body.innerHTML='<p>CAT after CAT.</p>';const n=document.querySelector('p')!.firstChild!,range=document.createRange(),selection=window.getSelection()!;range.setStart(n,0);range.setEnd(n,9);selection.removeAllRanges();selection.addRange(range);expect(canFlipPointer(document)).toBe(false);selection.collapse(n,0);expect(canFlipPointer(document)).toBe(true);selection.removeAllRanges();});
