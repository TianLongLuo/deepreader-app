// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,renderHook} from '@testing-library/react';
import {createElement} from 'react';
import {renderToString} from 'react-dom/server';
import {readReadingPreferences,writeReadingPreferences,useReadingPreferences} from '@/components/reader/reading-preferences';
const defaults={flow:'paginated',semanticFlip:false,targets:{en:'en',es:'en'}};
afterEach(()=>{cleanup();vi.restoreAllMocks();localStorage.clear();});
it('keeps new account preferences separate from legacy dictionary and theme keys',()=>{
 const values=new Map([['reader-preferences','legacy'],['deepreader:dictionary-expanded:alice','false']]),storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);}};
 writeReadingPreferences('a',{flow:'vertical',semanticFlip:true,targets:{en:'zh',es:'en'}},storage);expect(readReadingPreferences('a',storage)).toMatchObject({flow:'vertical',semanticFlip:true});expect(readReadingPreferences('b',storage)).toEqual(defaults);expect(values.get('reader-preferences')).toBe('legacy');expect(values.get('deepreader:dictionary-expanded:alice')).toBe('false');
 expect(JSON.parse(values.get('deepreader-reading:a')!).version).toBe(1);
});
it.each(['bad JSON','{"version":2,"preferences":{}}','{"version":1,"preferences":{"flow":"sideways","semanticFlip":true,"targets":{"en":"en","es":"en"}}}'])('ignores malformed versioned preferences',stored=>expect(readReadingPreferences('malformed',{getItem:()=>stored})).toEqual(defaults));
it('isolates source-language targets and account changes without copying the previous account',()=>{
 const h=renderHook(({userId})=>useReadingPreferences(userId),{initialProps:{userId:'pref-alice'}});act(()=>{h.result.current.setFlow('vertical');h.result.current.setSemanticFlip(true);h.result.current.setTarget('en','zh');h.result.current.setTarget('es','es');});expect(h.result.current.preferences).toEqual({flow:'vertical',semanticFlip:true,targets:{en:'zh',es:'es'}});h.rerender({userId:'pref-bob'});expect(h.result.current.preferences).toEqual(defaults);h.rerender({userId:'pref-alice'});expect(h.result.current.preferences.flow).toBe('vertical');
});
it('remains usable in memory when browser storage throws SecurityError',()=>{
 vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new DOMException('blocked','SecurityError');});vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new DOMException('blocked','SecurityError');});
 const h=renderHook(()=>useReadingPreferences('blocked-preferences'));act(()=>h.result.current.setSemanticFlip(true));act(()=>h.result.current.setTarget('es','zh'));expect(h.result.current.preferences).toMatchObject({semanticFlip:true,targets:{es:'zh'}});
});
it('uses a fixed server snapshot for hydration even with stored client preferences',()=>{
 localStorage.setItem('deepreader-reading:server',JSON.stringify({version:1,preferences:{flow:'vertical',semanticFlip:true,targets:{en:'zh',es:'zh'}}}));
 const Component=()=>createElement('span',null,useReadingPreferences('server').preferences.flow);expect(renderToString(createElement(Component))).toContain('paginated');
});
it('receives only the matching account storage event and cleans subscriptions after unmount',()=>{
 const h=renderHook(()=>useReadingPreferences('cross-tab'));act(()=>window.dispatchEvent(new StorageEvent('storage',{key:'deepreader-reading:other',newValue:JSON.stringify({version:1,preferences:{flow:'vertical',semanticFlip:true,targets:{en:'zh',es:'zh'}}})})));expect(h.result.current.preferences).toEqual(defaults);
 act(()=>window.dispatchEvent(new StorageEvent('storage',{key:'deepreader-reading:cross-tab',newValue:JSON.stringify({version:1,preferences:{flow:'vertical',semanticFlip:true,targets:{en:'zh',es:'en'}}})})));expect(h.result.current.preferences.flow).toBe('vertical');h.unmount();
});
it('survives blocked access to the storage object itself, not just its methods',()=>{
 vi.spyOn(window,'localStorage','get').mockImplementation(()=>{throw new DOMException('blocked','SecurityError');});const h=renderHook(()=>useReadingPreferences('blocked-storage-object'));act(()=>h.result.current.setFlow('vertical'));expect(h.result.current.preferences.flow).toBe('vertical');
});
