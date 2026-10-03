import {describe,expect,it} from 'vitest';
import {createOffsetProjection} from '@/components/reader/projection-offsets';

describe('original/display offsets',()=>{
 it('preserves later words while restoring only the first occurrence',()=>{
  const p=createOffsetProjection('CAT after CAT.');
  p.apply({id:'first',start:0,end:3,replacement:'small animal'});
  expect(p.text()).toBe('small animal after CAT.');
  expect(p.toOriginal(13,'before')).toBe(4);
  expect(p.toDisplay(4,'after')).toBe(13);
  expect(p.toOriginal(5,'before')).toBe(0);
  expect(p.toOriginal(5,'after')).toBe(3);
  p.apply({id:'last',start:10,end:13,replacement:'pet'});
  p.restore('first');expect(p.text()).toBe('CAT after pet.');
  expect(p.original).toBe('CAT after CAT.');
  p.restoreAll();p.restoreAll();expect(p.text()).toBe(p.original);
 });
 it('preserves exact boundary offsets and uses half-open hit testing',()=>{
  const p=createOffsetProjection('A CAT tail');
  p.apply({id:'word',start:2,end:5,replacement:'tiny pet'});
  expect(p.toDisplay(2,'before')).toBe(2);expect(p.toDisplay(5,'after')).toBe(10);
  expect(p.toOriginal(2,'after')).toBe(2);expect(p.toOriginal(10,'before')).toBe(5);
  expect(p.at(2)?.id).toBe('word');expect(p.at(9)?.id).toBe('word');expect(p.at(10)).toBeNull();
  expect(p.toDisplay(3,'before')).toBe(2);expect(p.toDisplay(3,'after')).toBe(10);
 });
 it('rejects overlap without mutating an earlier valid replacement',()=>{
  const p=createOffsetProjection('CAT after');
  p.apply({id:'cat',start:0,end:3,replacement:'animal'});
  expect(()=>p.apply({id:'overlap',start:1,end:4,replacement:'x'})).toThrow(RangeError);
  expect(p.text()).toBe('animal after');
  p.apply({id:'cat',start:0,end:3,replacement:'pet'});expect(p.text()).toBe('pet after');
 });
 it.each([[-1,2],[1,1],[1,40],[NaN,2],[0,1.5]])('rejects invalid source span %s..%s',(start,end)=>{
  expect(()=>createOffsetProjection('word').apply({id:'bad',start,end,replacement:'x'})).toThrow(RangeError);
 });
 it('rejects half-surrogate edits and preserves literal combining accents',()=>{
  const p=createOffsetProjection('🙂 Señor\u0301 don’t re-enter');
  expect(()=>p.apply({id:'bad',start:1,end:2,replacement:'x'})).toThrow(RangeError);
  p.apply({id:'eye',start:0,end:2,replacement:'smile'});
  expect(p.text()).toBe('smile Señor\u0301 don’t re-enter');
  expect(p.toOriginal(6,'before')).toBe(3);
 });
 it.each(['','   '])('rejects an empty display replacement %j',replacement=>{
  expect(()=>createOffsetProjection('word').apply({id:'w',start:0,end:4,replacement})).toThrow();
 });
 it.each(['x','a much longer phrase'])('roundtrips every untouched endpoint with %s',replacement=>{
  const p=createOffsetProjection('Before CAT after.');p.apply({id:'cat',start:7,end:10,replacement});
  for(const n of [0,1,2,3,4,5,6,7,10,11,12,13,14,15,16,17]){
   expect(p.toOriginal(p.toDisplay(n,'before'),'before')).toBe(n);
   expect(p.toOriginal(p.toDisplay(n,'after'),'after')).toBe(n);
  }
 });
 it('validates mapping bounds and does not expose mutable stored edits',()=>{
  const p=createOffsetProjection('CAT');const edit={id:'cat',start:0,end:3,replacement:'animal'};p.apply(edit);
  edit.replacement='wrong';expect(p.text()).toBe('animal');
  expect(()=>p.toOriginal(20,'before')).toThrow(RangeError);
  expect(()=>p.toDisplay(-1,'after')).toThrow(RangeError);
  expect(()=>p.toDisplay(NaN,'after')).toThrow(RangeError);
  p.restore('unknown');expect(p.text()).toBe('animal');
 });
});
