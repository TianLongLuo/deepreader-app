import fs from "node:fs/promises";

import {expect,it} from 'vitest';
import {semanticFlipSamples} from '../scripts/qa/semantic-flip-samples';
import {semanticFlipRequestSchema} from '@/lib/semantic-flip';
it('bounds ten synthetic acceptance cases with exact offsets, all language targets and independent sense criteria',()=>{
 expect(semanticFlipSamples).toHaveLength(10);for(const sample of semanticFlipSamples){expect(semanticFlipRequestSchema.parse(sample.input)).toEqual(sample.input);expect(sample.input.sourceText.slice(sample.input.start,sample.input.end)).toBe(sample.input.targetWord);expect(sample.senseCriterion.length).toBeGreaterThan(10);}
 for(const source of ['en','es'])for(const target of ['en','zh','es'])expect(semanticFlipSamples.some(s=>s.input.sourceLanguage===source&&s.input.targetLanguage===target)).toBe(true);
});
it('provides a fixed-layout EPUB to reject unsupported reading controls in a real browser',async()=>{
 const source=await fs.readFile('scripts/qa/reader-streaming.mjs','utf8');expect(source).toContain('rendition:layout');expect(source).toContain('pre-paginated');expect(source).toContain('epubFixed');
});
