import {expect,it} from 'vitest';
import {spanishDictionaryWordSchema,dictionaryShard} from '@/server/reading-assistant/dictionary';
it('normalizes NFC accents without stripping distinctions between Spanish words',()=>{
 expect(spanishDictionaryWordSchema.parse(' NIN\u0303O ')).toBe('niño');
 expect(spanishDictionaryWordSchema.parse('teórico-práctico')).toBe('teórico-práctico');
 expect(spanishDictionaryWordSchema.parse('sí')).not.toBe(spanishDictionaryWordSchema.parse('si'));
 expect(dictionaryShard(spanishDictionaryWordSchema.parse('NIN\u0303O'))).toBe(dictionaryShard('niño'));
});
it('rejects URL, injection, whitespace and invalid language characters',()=>{
 for(const word of ['https://evil.test','../niño','two words','你好','a'.repeat(65)])expect(spanishDictionaryWordSchema.safeParse(word).success).toBe(false);
});
