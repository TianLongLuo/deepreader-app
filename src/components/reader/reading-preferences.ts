'use client';
import {useCallback,useSyncExternalStore} from 'react';
import type {ReadingFlow} from './reading-flow';
export type ReadingPreferences={flow:ReadingFlow;semanticFlip:boolean;targets:Record<'en'|'es','en'|'zh'|'es'>};
const defaults:ReadingPreferences={flow:'paginated',semanticFlip:false,targets:{en:'en',es:'en'}};
const fresh=():ReadingPreferences=>({...defaults,targets:{...defaults.targets}}),key=(userId:string)=>'deepreader-reading:'+userId;
const memory=new Map<string,ReadingPreferences>();
function decode(raw:string|null):ReadingPreferences{
 try{const value=JSON.parse(raw??'null'),p=value?.preferences;if(value?.version!==1||!['paginated','vertical'].includes(p?.flow)||typeof p?.semanticFlip!=='boolean'||!['en','zh','es'].includes(p?.targets?.en)||!['en','zh','es'].includes(p?.targets?.es))return fresh();return {flow:p.flow,semanticFlip:p.semanticFlip,targets:{en:p.targets.en,es:p.targets.es}};}catch{return fresh();}
}
export function readReadingPreferences(userId:string,storage:Pick<Storage,'getItem'>):ReadingPreferences{
 try{return memory.get(userId)??decode(storage.getItem(key(userId)));}catch{return memory.get(userId)??fresh();}
}
export function writeReadingPreferences(userId:string,value:ReadingPreferences,storage:Pick<Storage,'setItem'>):void{
 const safe=decode(JSON.stringify({version:1,preferences:value}));try{storage.setItem(key(userId),JSON.stringify({version:1,preferences:safe}));memory.delete(userId);}catch{memory.set(userId,safe);}
}
type Entry={value:ReadingPreferences;listeners:Set<()=>void>};
const entries=new Map<string,Entry>();
function entryFor(userId:string){let entry=entries.get(userId);if(!entry){entry={value:fresh(),listeners:new Set()};entries.set(userId,entry);}return entry;}
function publish(entry:Entry,value:ReadingPreferences){if(JSON.stringify(entry.value)===JSON.stringify(value))return;entry.value=value;entry.listeners.forEach(listener=>listener());}
export function useReadingPreferences(userId:string){
 const snapshot=useCallback(()=>{const entry=entryFor(userId);if(!entry.listeners.size&&typeof window!=='undefined'){let value:ReadingPreferences;try{value=readReadingPreferences(userId,window.localStorage);}catch{value=memory.get(userId)??fresh();}if(JSON.stringify(value)!==JSON.stringify(entry.value))entry.value=value;}return entry.value;},[userId]);
 const subscribe=useCallback((listener:()=>void)=>{const entry=entryFor(userId);entry.listeners.add(listener);const storage=(event:StorageEvent)=>{if(event.key!==key(userId))return;memory.delete(userId);publish(entry,decode(event.newValue));};window.addEventListener('storage',storage);return()=>{entry.listeners.delete(listener);window.removeEventListener('storage',storage);};},[userId]);
 const preferences=useSyncExternalStore(subscribe,snapshot,()=>defaults);
 const update=useCallback((change:(p:ReadingPreferences)=>ReadingPreferences)=>{const entry=entryFor(userId),value=change(entry.value);try{writeReadingPreferences(userId,value,window.localStorage);}catch{memory.set(userId,value);}publish(entry,value);},[userId]);
 return {preferences,setFlow:useCallback((flow:ReadingFlow)=>update(p=>({...p,flow})),[update]),setSemanticFlip:useCallback((semanticFlip:boolean)=>update(p=>({...p,semanticFlip})),[update]),setTarget:useCallback((source:'en'|'es',target:'en'|'zh'|'es')=>update(p=>({...p,targets:{...p.targets,[source]:target}})),[update])};
}
