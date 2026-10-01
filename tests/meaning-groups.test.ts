import {expect,it} from 'vitest';
import {alignMeaningGroups,validateMeaningGroupResult} from '@/lib/meaning-groups';
const text='The Greek polis developed slowly during the Dark Age.';
const output={groups:[{text:'The Greek polis'},{text:'developed slowly',verbs:['developed']},{text:'during the Dark Age.'}]};
it('aligns consecutive chunks and verbs without changing any original words',()=>{
 const result=alignMeaningGroups(text,output);
 expect(result.groups.map(g=>text.slice(g.start,g.end))).toEqual(output.groups.map(g=>g.text));
 expect(result.verbs.map(v=>text.slice(v.start,v.end))).toEqual(['developed']);
 expect(validateMeaningGroupResult(text,result)).toEqual(result);
});
it('normalizes whitespace, preserving accents, apostrophes and UTF-16 offsets',()=>{
 const source="  El niño\n  no había visto el jardín. ";
 const result=alignMeaningGroups(source,{groups:[{text:'El niño'},{text:'no había visto',verbs:['no había visto']},{text:'el jardín.'}]});
 expect(result.text).toBe('El niño no había visto el jardín.');
 expect(result.text.slice(result.verbs[0].start,result.verbs[0].end)).toBe('no había visto');
});
it.each([
 {groups:[{text:'The Greek polis'},{text:'during the Dark Age.'}]},
 {groups:[{text:'The Greek polis'},{text:'The Greek polis'},{text:'developed slowly during the Dark Age.'}]},
 {groups:[{text:'The Greek polis'},{text:'invented words'}]},
 {groups:[{text:'The Greek polis developed slow'},{text:'ly during the Dark Age.'}]},
 {groups:[{text,verbs:['imaginary']}]},
 {groups:[]},
])('rejects omissions, duplicates, inventions, split words and ungrounded verbs',o=>{expect(()=>alignMeaningGroups(text,o)).toThrow();});
it('rejects forged offsets even if text matches',()=>{const r=alignMeaningGroups(text,output);r.groups[1].start=0;expect(()=>validateMeaningGroupResult(text,r)).toThrow();});
it('handles repeated phrases by position rather than global search',()=>{
 const r=alignMeaningGroups('He left; she left.',{groups:[{text:'He left;',verbs:['left']},{text:'she left.',verbs:['left']}]});
 expect(r.verbs.map(v=>v.start)).toEqual([3,13]);
});
it('validates spans structurally rather than by JSON property ordering',()=>{
 const r=alignMeaningGroups(text,output);
 const reordered={verbs:r.verbs.map(({text,start,end})=>({text,end,start})),groups:r.groups.map(({text,start,end})=>({end,text,start})),text:r.text};
 expect(validateMeaningGroupResult(text,reordered)).toEqual(r);
});
