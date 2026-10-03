'use client';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import { useReaderStore } from '@/hooks/use-reader-store';
import { floatingPanelLayout, type StudyAnchor, type FloatingFrame } from './floating-study-layout';
import {Pin,X,GripHorizontal} from 'lucide-react';
import {useUIPreferences} from '@/hooks/use-ui-preferences';
import type {PanelKind} from '@/lib/ui-preferences';
import type {AnchorHandle} from './selection-anchor';
import {installStudyDismiss} from './study-dismiss-events';
import {isAnchorOffscreen} from './floating-study-policy';
import StudyLanguageSelect from './study-language-select';

type Props={children:ReactNode;panel:ReactNode;open:boolean;side:'left'|'right';title:string;onClose:()=>void;anchor?:StudyAnchor;kind?:PanelKind;anchorHandle?:AnchorHandle;onReturnToSource?:()=>void;flow?:'vertical'|'paginated'};
type Gesture={kind:'move'|'resize';pointerId:number;x:number;y:number;start:FloatingFrame};
export default function StudyDock({children,panel,open,side,title,onClose,anchor,kind='word',anchorHandle,onReturnToSource,flow='paginated'}:Props){
 const root=useRef<HTMLDivElement>(null);
 const {studyPinned:pinned,setStudyPinned}=useReaderStore();
 const {panels,setPanelSize}=useUIPreferences();
 const {width:explanationPanelWidth,height:explanationPanelHeight}=panels[kind];
 const setExplanationPanelSize=(size:{width:number;height:number})=>setPanelSize(kind,size);
 const [live,setLive]=useState<StudyAnchor|null>(null);
 const panelRef=useRef<HTMLElement>(null);
 const dismiss=()=>{onClose();anchorHandle?.focus();};
 const [frame,setFrame]=useState({left:0,top:0,width:0,height:0});
 const [gesture,setGesture]=useState<Gesture|null>(null);
 const [manual,setManual]=useState<{anchor:StudyAnchor|undefined;box:FloatingFrame}|null>(null);
 useEffect(()=>{const node=root.current;if(!node)return;const measure=()=>{const r=node.getBoundingClientRect();setFrame({left:r.left,top:r.top,width:r.width,height:Math.max(0,Math.min(r.height,(window.visualViewport?.height??window.innerHeight)-Math.max(0,r.top)))});};const observer=new ResizeObserver(measure);observer.observe(node);window.addEventListener('resize',measure);window.visualViewport?.addEventListener('resize',measure);measure();return()=>{observer.disconnect();window.removeEventListener('resize',measure);window.visualViewport?.removeEventListener('resize',measure);};},[]);
 useEffect(()=>{if(pinned&&!gesture)setManual(null);},[live,frame.width,frame.height,pinned]);
 useEffect(()=>{if(!open){setManual(null);setGesture(null);}},[open]);
 useLayoutEffect(()=>{if(!open)return;const update=()=>{const next=anchorHandle?.measure()??null;setLive(old=>JSON.stringify(old)===JSON.stringify(next)?old:next);};update();const timer=window.setInterval(update,180);return()=>clearInterval(timer);},[open,anchorHandle]);
 useEffect(()=>{if(!open)return;const off=root.current?installStudyDismiss(root.current,()=>pinned,onClose):()=>{};const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopPropagation();onClose();anchorHandle?.focus();}};document.addEventListener('keydown',key);return()=>{off();document.removeEventListener('keydown',key);};},[open,pinned,onClose,anchorHandle]);
 const target=anchorHandle?live:anchor;
 const relative=target?{left:target.left-frame.left,right:target.right-frame.left,top:target.top-frame.top,bottom:target.bottom-frame.top}:undefined;
 const automatic=floatingPanelLayout(frame.width,frame.height,{width:explanationPanelWidth,height:explanationPanelHeight},side,relative,{flow,kind});
 const size=manual?.anchor===anchor&&manual?{...manual.box,width:Math.min(manual.box.width,frame.width),height:Math.min(manual.box.height,frame.height)}:automatic;
 const rect={...size,left:Math.max(0,Math.min(size.left,frame.width-size.width)),top:Math.max(0,Math.min(size.top,frame.height-size.height))};
 useEffect(()=>{
  if(!gesture)return;
  const move=(e:PointerEvent)=>{
   if(e.pointerId!==gesture.pointerId)return;
   const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;
   if(gesture.kind==='move')setManual({anchor,box:{...gesture.start,left:Math.max(0,Math.min(gesture.start.left+dx,frame.width-gesture.start.width)),top:Math.max(0,Math.min(gesture.start.top+dy,frame.height-gesture.start.height))}});
   else {const next={width:Math.min(frame.width-gesture.start.left,Math.max(280,gesture.start.width+dx)),height:Math.min(frame.height-gesture.start.top,Math.max(180,gesture.start.height+dy))};setManual({anchor,box:{...gesture.start,...next}});setExplanationPanelSize(next);}
  };
  const end=(e:PointerEvent)=>{if(e.pointerId===gesture.pointerId)setGesture(null);};
  window.addEventListener('pointermove',move);window.addEventListener('pointerup',end);window.addEventListener('pointercancel',end);
  return()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end);window.removeEventListener('pointercancel',end);};
 },[gesture,anchor,frame,setExplanationPanelSize]);
 const start=(e:ReactPointerEvent<HTMLElement>,kind:Gesture['kind'])=>{if(e.button!==0)return;if(kind==='move'&&(e.target as HTMLElement).closest('button,select,label'))return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);setGesture({kind,pointerId:e.pointerId,x:e.clientX,y:e.clientY,start:rect});};
 return <div ref={root} data-study-layout className="relative min-h-0 min-w-0 flex-1 overflow-hidden" onScrollCapture={e=>{if(open&&!pinned&&(e.target as HTMLElement).closest('[data-reading-body]'))onClose();}}>
  {/* The reader always occupies this same box, whether or not the overlay is open. */}
  <div data-reading-body className="absolute inset-0 min-h-0 min-w-0 overflow-hidden">{children}</div>
  {open&&frame.width>0&&<section ref={panelRef} data-study-panel role="region" aria-label={title} className="absolute z-40 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground native-panel" style={{left:rect.left,top:rect.top,width:rect.width,height:rect.height}}>
   <header tabIndex={0} aria-label="拖动学习浮窗" className="flex min-h-10 shrink-0 touch-none cursor-move items-center justify-between gap-1 border-b border-border px-2 py-1" onPointerDown={e=>start(e,'move')} onKeyDown={e=>{if(e.target!==e.currentTarget||!e.key.startsWith('Arrow'))return;e.preventDefault();setManual({anchor,box:{...rect,left:rect.left+(e.key==='ArrowRight'?20:e.key==='ArrowLeft'?-20:0),top:rect.top+(e.key==='ArrowDown'?20:e.key==='ArrowUp'?-20:0)}});}}>
    <span className="flex min-w-0 items-center gap-1 pl-1 text-xs text-muted-foreground"><GripHorizontal className="h-3.5 w-3.5"/><span className="truncate">{kind==='word'?'查词':'段落解析'}</span></span><div className="ml-auto flex shrink-0 items-center gap-0.5"><StudyLanguageSelect/><button type="button" aria-label={pinned?'取消固定':'固定浮窗'} aria-pressed={pinned} title="固定在当前阅读页面" onClick={()=>setStudyPinned(!pinned)} className={`rounded-md p-2 hover:bg-muted ${pinned?'text-primary':'text-muted-foreground'}`}><Pin className="h-3.5 w-3.5"/></button><button type="button" aria-label="关闭学习面板" onClick={dismiss} className="rounded-md p-2 text-muted-foreground hover:bg-muted"><X className="h-4 w-4"/></button></div>
   </header>
   {pinned&&isAnchorOffscreen(relative,frame.width,frame.height)&&onReturnToSource&&<button className="px-3 py-1 text-left text-xs text-primary" onClick={onReturnToSource}>返回原文 ↗</button>}
   {rect.crowded&&<p className="shrink-0 px-3 py-1 text-xs">空白不足，可拖动标题栏调整浮窗位置。</p>}
   <div className="min-h-0 flex-1 overflow-hidden">{panel}</div>
   <button type="button" aria-label="调整学习面板大小" title="拖动调整大小；方向键也可调整" className="absolute bottom-0 right-0 z-30 h-7 w-7 touch-none cursor-se-resize rounded-tl-lg text-muted-foreground hover:bg-muted" onPointerDown={e=>start(e,'resize')} onKeyDown={e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const next={width:Math.min(frame.width-rect.left,Math.max(280,rect.width+(e.key==='ArrowRight'?20:e.key==='ArrowLeft'?-20:0))),height:Math.min(frame.height-rect.top,Math.max(180,rect.height+(e.key==='ArrowDown'?20:e.key==='ArrowUp'?-20:0)))};setManual({anchor,box:{...rect,...next}});setExplanationPanelSize(next);}}>↘</button>
  </section>}
  {gesture&&<div className="absolute inset-0 z-50 cursor-grabbing"/>}
 </div>;
}
