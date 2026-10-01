import {expect,it} from 'vitest';
import {readPartialString} from '@/lib/partial-json-string';
it('decodes only complete escapes in a top-level answer',()=>{
 expect(readPartialString('{"answer":"ni\\u00','answer')).toBe('ni');
 expect(readPartialString('{"answer":"ni\\u00f1o','answer')).toBe('niño');
 expect(readPartialString('{"meta":"answer","answer":"A \\"quote','answer')).toBe('A "quote');
});
it('ignores matching words and nested properties before the actual top-level key',()=>{
 expect(readPartialString('{"meta":{"answer":"wrong"},"list":["answer",{"answer":"wrong"}],"answer":"right','answer')).toBe('right');
 expect(readPartialString('{"other":"answer: \\"wrong\\"","answer":"yes"}','answer')).toBe('yes');
 expect(readPartialString('{"nested":{"answer":"wrong"}}','answer')).toBe('');
});
it('waits for complete surrogate pairs instead of rendering broken characters',()=>{
 expect(readPartialString('{"answer":"Hi \\ud83d','answer')).toBe('Hi ');
 expect(readPartialString('{"answer":"Hi \\ud83d\\ude','answer')).toBe('Hi ');
 expect(readPartialString('{"answer":"Hi \\ud83d\\ude00!','answer')).toBe('Hi 😀!');
 expect(readPartialString('{"answer":"Hi \ud83d','answer')).toBe('Hi ');
 expect(readPartialString('{"answer":"Hi 😀','answer')).toBe('Hi 😀');
});
it('handles arbitrary chunk boundaries and every JSON escape without losing text',()=>{
 const value='A "quote" \\ /\n\t\b\f\r español 😀',raw=JSON.stringify({answer:value});
 let last='';for(let i=0;i<=raw.length;i++){const next=readPartialString(raw.slice(0,i),'answer');expect(value.startsWith(next)).toBe(true);expect(next.startsWith(last)).toBe(true);last=next;}
 expect(last).toBe(value);
});
it('handles fenced JSON and escaped property names but never guesses non-string answers',()=>{
 expect(readPartialString('```json\n{"\\u0061nswer":"Hello','answer')).toBe('Hello');
 for(const raw of ['{"answer":123}','{"answer":null}','{"answer":{"text":"wrong"}}','not JSON','{"ans'])expect(readPartialString(raw,'answer')).toBe('');
});
it('extracts complete group objects despite nested metadata and braces inside strings',async()=>{
 const {readCompleteArrayObjects}=await import('@/lib/partial-json-string');
 const raw='{"meta":{"groups":[{"text":"wrong"}]},"groups":[{"text":"A {quote}","verbs":["a"]},{"text":"unfinished';
 expect(readCompleteArrayObjects(raw,'groups')).toEqual([{text:'A {quote}',verbs:['a']}]);
});
