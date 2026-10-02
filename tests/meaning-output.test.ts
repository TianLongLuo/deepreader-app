import {expect,it} from 'vitest';
import {JSDOM} from 'jsdom';
import {alignGeneratedMeaning} from '@/server/reading-assistant/meaning-output';
import {validateMeaningGroupResult} from '@/lib/meaning-groups';
import {collectMeaningSources} from '@/components/reader/meaning-text-source';
import {meaningRanges} from '@/components/reader/meaning-group-highlights';

it('preserves a whole long paragraph when only optional emphasis has omitted an intervening adverb',()=>{
 const text='I squint against the wind and steer my bike into the snowplow’s fading tracks. The top of the hill doesn’t seem to be getting any closer; the harder I fight, the more I’m pulled back. There’s nothing along this stretch of road apart from endless trees and a crumbling stone wall, and while you can usually smell the ocean if the breeze is blowing from one direction or the dump if it’s coming from the other, right now my face is frozen solid and I can’t smell a damn thing.';
 const phrases=['I squint against the wind','and steer my bike','into the snowplow’s fading tracks.','The top of the hill','doesn’t seem to be getting any closer;','the harder I fight,','the more I’m pulled back.','There’s nothing along this stretch of road','apart from endless trees and a crumbling stone wall,','and while you can usually smell the ocean','if the breeze is blowing from one direction','or the dump','if it’s coming from the other,','right now my face is frozen solid','and I can’t smell a damn thing.'];
 const groups=phrases.map(text=>({text,verbs:text.includes('usually')?['can smell']:[]}));
 const result=alignGeneratedMeaning(text,{groups},true);
 expect(result.groups.map(g=>g.text)).toEqual(phrases);
 expect(result.verbs).toEqual([]);
 expect(validateMeaningGroupResult(text,result)).toEqual(result);
 const doc=new JSDOM('<p></p>').window.document;doc.querySelector('p')!.textContent=text;
 const source=collectMeaningSources(doc.body)[0],ranges=meaningRanges(source,result)!;
 expect(ranges.groups.map(r=>r.toString()).join(' ')).toBe(text);
 expect(doc.querySelector('p')!.textContent).toBe(text);
});
it('retains Spanish accents and only grounded optional emphasis',()=>{
 const text='¿Qué estás haciendo aquí?';
 const result=alignGeneratedMeaning(text,{groups:[{text:'¿Qué estás haciendo aquí?',verbs:['inventado','estás haciendo']}]},true);
 expect(result.verbs).toEqual([{text:'estás haciendo',start:5,end:19}]);
 expect(validateMeaningGroupResult(text,result)).toEqual(result);
});
it.each([
 {groups:[{text:'The engine'}]},
 {groups:[{text:'The motor started.'}]},
 {groups:[{text:'The engine started'},{text:'The engine started.'}]},
 {groups:[{text:'The eng'},{text:'ine started.'}]},
 {groups:[null]},
])('never treats an optional-verb fallback as permission to omit, invent or split source words',output=>{
 expect(()=>alignGeneratedMeaning('The engine started.',output,true)).toThrow();
});
