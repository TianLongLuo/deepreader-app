'use client';
import {useEffect,useState,type ReactNode} from 'react';

/** Mount keyed by account, not word or book. Storage is optional, never a lookup dependency. */
export default function DictionaryDisclosure({userId,children}:{userId:string;children:ReactNode}){
 const key=`deepreader:dictionary-expanded:${userId}`;
 const [open,setOpen]=useState(true);
 useEffect(()=>{
  try{setOpen(window.localStorage.getItem(key)!=='false');}catch{/* Keep the usable default when storage is blocked. */}
 },[key]);
 return <details className="mt-3 text-sm" open={open} onToggle={event=>{
  const next=event.currentTarget.open;
  // Native toggle also fires when React restores a saved value; do not save those events.
  if(next===open)return;
  setOpen(next);
  try{window.localStorage.setItem(key,String(next));}catch{/* Session interaction still works. */}
 }}>{children}</details>;
}
