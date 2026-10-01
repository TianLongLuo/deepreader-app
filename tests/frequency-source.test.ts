import {expect,it} from 'vitest';
import {frequencyBand,lookupFrequency} from '@/server/vocabulary/frequency';
it('keeps unknown distinct from lower frequency and uses declared product bands',()=>{
 expect(frequencyBand(null)).toBe('unknown');expect(frequencyBand(0)).toBe('unknown');expect(frequencyBand(2.5)).toBe('less-common');expect(frequencyBand(3)).toBe('general');expect(frequencyBand(4)).toBe('common');
});
it('queries pinned offline English and Spanish data, preserving accents, unknowns and order',async()=>{
 const values=await lookupFrequency([{lemma:'occasion',language:'en'},{lemma:'cafe\u0301',language:'en'},{lemma:'cafe',language:'en'},{lemma:'negociar',language:'es'},{lemma:'qzxqzxnotarealword',language:'en'}],new AbortController().signal);
 expect(values.map(v=>v.lemma)).toEqual(['occasion','café','cafe','negociar','qzxqzxnotarealword']);expect(values[0].zipf).toBeGreaterThan(0);expect(values[1].zipf).not.toBe(values[2].zipf);expect(values[3].zipf).toBeGreaterThan(0);expect(values[4].zipf).toBeNull();expect(values[0].version).toBe('wordfreq-3.1.1');expect(values[0].source).toContain('rspeer/wordfreq');
},15000);
it('bounds batches and cancels before spawning without shell interpolation',async()=>{
 await expect(lookupFrequency(Array.from({length:101},()=>({lemma:'word',language:'en' as const})),new AbortController().signal)).rejects.toThrow();
 const abort=new AbortController();abort.abort();await expect(lookupFrequency([{lemma:'word',language:'en'}],abort.signal)).rejects.toMatchObject({name:'AbortError'});
});
