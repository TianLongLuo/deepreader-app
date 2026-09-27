import {expect,it,vi,afterEach} from 'vitest';
import {lookupDictionary} from '@/server/reading-assistant/dictionary';
afterEach(()=>vi.unstubAllGlobals());
it('reads English and Spanish locally even without network',async()=>{
 const network=vi.fn(()=>{throw Error('Network forbidden')});vi.stubGlobal('fetch',network);
 for(const [language,word] of [['en','occasion'],['es','niño'],['es','casa']] as const){const entry=await lookupDictionary(word,undefined,language);expect(entry.provider).toBe('local-wiktionary');expect(entry.phonetic).not.toBe('');}
 expect(network).not.toHaveBeenCalled();
});
it('returns a local miss',async()=>{await expect(lookupDictionary('unlistedfixtureword')).rejects.toMatchObject({status:404});});
it('cancels before IO',async()=>{const c=new AbortController();c.abort();await expect(lookupDictionary('word',c.signal)).rejects.toMatchObject({name:'AbortError'});});
