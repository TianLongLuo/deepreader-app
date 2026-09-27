import {afterEach,expect,it,vi} from 'vitest';
import {lookupDictionary} from '@/server/reading-assistant/dictionary';
afterEach(()=>vi.unstubAllGlobals());
it.each([['en','occasion'],['es','niño'],['es','casa']] as const)('reads %s → Chinese definitions locally for %s',async(language,word)=>{const network=vi.fn(()=>{throw Error('No network')});vi.stubGlobal('fetch',network);const entry=await lookupDictionary(word,undefined,language,'zh');expect(entry.definitionLanguage).toBe('zh');expect(JSON.stringify(entry.meanings)).toMatch(/[\u3400-\u9fff]/);expect(entry.sourceUrl).toContain(language==='en'?'skywind3000/ECDICT':'zh.wiktionary.org');expect(network).not.toHaveBeenCalled();});
it('keeps the English-definition default',async()=>{expect((await lookupDictionary('occasion')).definitionLanguage).toBe('en');});
it('does not silently return English for a Chinese miss',async()=>{await expect(lookupDictionary('unlistedfixtureword',undefined,'es','zh')).rejects.toMatchObject({status:404});});
