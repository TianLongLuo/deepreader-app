import {expect,it} from 'vitest';
import {createMeaningResultCache} from '@/components/reader/meaning-result-cache';
const result=(text:string)=>({text,groups:[{text,start:0,end:text.length}],verbs:[]});
it('bounds cache by original UTF-16 chars and refreshes LRU on get',()=>{
 const c=createMeaningResultCache({maxUnits:2,maxChars:7});c.set('a','abcd',result('abcd'));c.set('b','efgh',result('efgh'));expect(c.get('a')).toBeUndefined();expect(c.stats()).toEqual({units:1,chars:4});
 const d=createMeaningResultCache({maxUnits:2,maxChars:20});d.set('a','a',result('a'));d.set('b','b',result('b'));d.get('a');d.set('c','c',result('c'));expect(d.get('b')).toBeUndefined();expect(d.get('a')).toBeDefined();
});
it('counts replacements by original chars, validates complete coverage and rejects oversized entries',()=>{
 const c=createMeaningResultCache({maxUnits:2,maxChars:4});c.set('emoji','😀',result('😀'));expect(c.stats().chars).toBe(2);c.set('huge','abcde',result('abcde'));expect(c.stats()).toEqual({units:1,chars:2});
 expect(()=>c.set('bad','hello',{text:'hello',groups:[{text:'he',start:0,end:2}],verbs:[]})).toThrow();expect(c.get('bad')).toBeUndefined();c.clear();expect(c.stats()).toEqual({units:0,chars:0});
});
it('stores only offset data and clones results so caller mutation cannot poison completed entries',()=>{
 const c=createMeaningResultCache(),value=result('Hello.');c.set('a','Hello.',value);value.groups[0].text='changed';expect(c.get('a')!.groups[0].text).toBe('Hello.');const hit=c.get('a')!;hit.groups[0].end=0;expect(c.get('a')!.groups[0].end).toBe(6);
 for(let i=0;i<129;i++)c.set(String(i),'a',result('a'));expect(c.stats().units).toBe(128);
});
