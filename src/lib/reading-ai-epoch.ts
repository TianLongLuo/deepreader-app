'use client';
import {useCallback,useSyncExternalStore} from 'react';
const EVENT='deepreader:reading-ai-settings',CHANNEL='deepreader-reading-ai',key=(userId:string)=>'deepreader-reading-ai:'+userId;
type Entry={epoch:string;listeners:Set<()=>void>};const entries=new Map<string,Entry>();
const valid=(value:unknown):value is string=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,200}$/.test(value);
function entryFor(userId:string){let entry=entries.get(userId);if(!entry){let epoch='0';try{const stored=localStorage.getItem(key(userId));if(valid(stored))epoch=stored;}catch{}entry={epoch,listeners:new Set()};entries.set(userId,entry);}return entry;}
function publish(userId:string,epoch:string){const entry=entryFor(userId);if(entry.epoch===epoch)return;entry.epoch=epoch;entry.listeners.forEach(listener=>listener());}
export function signalReadingAISettingsChanged(userId:string){
 const epoch=globalThis.crypto?.randomUUID?.()??`epoch-${Date.now()}-${Math.random().toString(36).slice(2)}`;
 publish(userId,epoch);try{localStorage.setItem(key(userId),epoch);}catch{}
 const payload={userId,epoch};window.dispatchEvent(new CustomEvent(EVENT,{detail:payload}));
 try{const channel=new BroadcastChannel(CHANNEL);channel.postMessage(payload);channel.close();}catch{}
}
export function useReadingAIEpoch(userId:string):string{
 const subscribe=useCallback((listener:()=>void)=>{
  const entry=entryFor(userId);entry.listeners.add(listener);
  const receive=(payload:unknown)=>{const p=payload as {userId?:unknown;epoch?:unknown};if(p?.userId===userId&&valid(p.epoch))publish(userId,p.epoch);};
  const event=(e:Event)=>receive((e as CustomEvent).detail),storage=(e:StorageEvent)=>{if(e.key===key(userId)&&valid(e.newValue))publish(userId,e.newValue);};
  window.addEventListener(EVENT,event);window.addEventListener('storage',storage);
  let channel:BroadcastChannel|undefined;try{channel=new BroadcastChannel(CHANNEL);channel.addEventListener('message',e=>receive(e.data));}catch{}
  return()=>{entry.listeners.delete(listener);window.removeEventListener(EVENT,event);window.removeEventListener('storage',storage);channel?.close();};
 },[userId]);
 return useSyncExternalStore(subscribe,useCallback(()=>entryFor(userId).epoch,[userId]),()=> '0');
}
