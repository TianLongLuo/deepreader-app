import {expect,it} from 'vitest';
import {splitMeaningText,offsetMeaningResult,MeaningUnitTooLargeError} from '@/lib/meaning-group-units';
import type {MeaningGroupResult} from '@/lib/meaning-groups';
it('covers long Spanish text verbatim without dropping its tail',()=>{
 const text=('Ella no había podido verlo. Él llegó después. ').repeat(150).trim();
 const units=splitMeaningText(text,1200,'es');
 expect(units.length).toBeGreaterThan(1);
 expect(units.map(u=>u.text).join('').replace(/\s/g,'')).toBe(text.replace(/\s/g,''));
 for(const u of units){expect(u.text).toBe(text.slice(u.start,u.end));expect(u.text.length).toBeLessThanOrEqual(1200);}
 expect(units.at(-1)?.end).toBe(text.length);
});
it('uses sentence boundaries instead of splitting a predicate unnecessarily',()=>{
 expect(splitMeaningText('I saw him. He had not left. We waited.',28)).toEqual([
  {text:'I saw him. He had not left.',start:0,end:27},
  {text:'We waited.',start:28,end:38},
 ]);
});
it('falls back to whitespace for an oversized sentence without changing offsets',()=>{
 const text='  one two\nthree four five  ';
 expect(splitMeaningText(text,10)).toEqual([
  {text:'one two',start:2,end:9},
  {text:'three four',start:10,end:20},
  {text:'five',start:21,end:25},
 ]);
});
it('keeps contractions hyphens surrogate pairs and combining accents intact',()=>{
 const text="Don't re-enter 🙂 Sen\u0303or llegó después.";
 const units=splitMeaningText(text,15,'es');
 expect(units.map(u=>u.text).join(' ')).toBe(text);
 expect(units.some(u=>u.text.includes('re-enter'))).toBe(true);
 expect(units.some(u=>u.text.includes('🙂'))).toBe(true);
 expect(units.some(u=>u.text.includes('Sen\u0303or'))).toBe(true);
 for(const u of units)expect(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(u.text)).toBe(false);
});
it('reports a token exceeding the limit rather than truncating it',()=>{
 expect(()=>splitMeaningText('a'.repeat(1201),1200)).toThrow(MeaningUnitTooLargeError);
});
it('returns no units for blank input and rejects unsafe limits',()=>{
 expect(splitMeaningText(' \n\t ')).toEqual([]);
 for(const max of [0,-1,1.5,Infinity,NaN,4001])expect(()=>splitMeaningText('word',max)).toThrow(RangeError);
});
it('maps both predicates and groups to source offsets without mutating validated results',()=>{
 const input:MeaningGroupResult={text:'I waited.',groups:[{text:'I waited.',start:0,end:9}],verbs:[{text:'waited',start:2,end:8}]};
 expect(offsetMeaningResult(input,20)).toEqual({groups:[{text:'I waited.',start:20,end:29}],verbs:[{text:'waited',start:22,end:28}]});
 expect(input.groups[0].start).toBe(0);expect(input.verbs[0].start).toBe(2);
 expect(()=>offsetMeaningResult(input,-1)).toThrow(RangeError);
});
