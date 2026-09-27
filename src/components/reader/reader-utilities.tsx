'use client';
import {useEffect,type ReactNode} from 'react';
export default function ReaderUtilities({open,onClose,children}:{open:boolean;onClose:()=>void;children:ReactNode}){
 useEffect(()=>{if(!open)return;const key=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[open,onClose]);
 return open?<section data-reader-utility aria-label="阅读工具面板" className="absolute inset-y-16 right-3 z-50 flex w-[min(400px,calc(100%-24px))] flex-col overflow-hidden rounded-xl border border-border bg-card text-foreground shadow-sm "><header className="flex items-center justify-between border-b border-border px-4 py-2 text-sm font-medium">阅读工具<button aria-label="关闭阅读工具" onClick={onClose} className="rounded-md p-2 hover:bg-muted">✕</button></header><div className="min-h-0 flex-1">{children}</div></section>:null;
}
