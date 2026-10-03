import {expect,it} from 'vitest';
import {semanticLabelFit} from '@/components/reader/stable-flip-layer';
it('fits the whole two-character gloss into my without hiding either character',()=>{expect(semanticLabelFit(24,34,18)).toEqual({fontSize:18*24/34,showReplacement:true});});
it('never enlarges a short translation beyond the book font',()=>{expect(semanticLabelFit(80,34,18)).toEqual({fontSize:18,showReplacement:true});});
it('keeps the original word instead of making a long gloss microscopic',()=>{expect(semanticLabelFit(24,360,18)).toEqual({fontSize:18,showReplacement:false});});
it('keeps waiting and source text at the original size',()=>{expect(semanticLabelFit(24,0,18)).toEqual({fontSize:18,showReplacement:true});});
