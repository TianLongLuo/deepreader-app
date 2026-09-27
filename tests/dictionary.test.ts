import {expect,it} from 'vitest';
import {dictionaryWordSchema,dictionaryShard} from '@/server/reading-assistant/dictionary';
it('validates and normalizes words without allowing URL paths',()=>{for(const s of ['', 'two words','https://evil.test','../foo','a'.repeat(65)])expect(dictionaryWordSchema.safeParse(s).success).toBe(false);expect(dictionaryWordSchema.parse(' HELLO ')).toBe('hello');expect(dictionaryShard('hello')).toMatch(/^[a-f0-9]{2}$/);});
