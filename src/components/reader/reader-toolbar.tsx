'use client';

import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {Search,Settings,ArrowLeft,NotebookPen} from 'lucide-react';
import type { ReactNode } from 'react';
import { ChevronUp, ChevronDown, BookmarkPlus, ChevronLeft, ChevronRight, List, Maximize2, Minimize2 } from 'lucide-react';

export type ReaderToolbarProps = {
  title: string;
  navigationKind?:'page'|'screen';
  onUtility?:(tab:string)=>void;
  positionLabel?: string;
  onPrevious: () => void;
  onNext: () => void;
  onBookmark: () => void;
  onContents: () => void;
  onFullscreen: () => void;
  immersive: boolean;
  previousDisabled?: boolean;
  nextDisabled?: boolean;
  bookmarkDisabled?: boolean;
  children?: ReactNode;
};

const controlClass = 'inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent  ';

export default function ReaderToolbar({
  title,
  navigationKind='page',
  onUtility,
  positionLabel,
  onPrevious,
  onNext,
  onBookmark,
  onContents,
  onFullscreen,
  immersive,
  previousDisabled = false,
  nextDisabled = false,
  bookmarkDisabled = false,
  children,
}: ReaderToolbarProps) {
  const [open,setOpen]=useState(false);
  const root=useRef<HTMLElement>(null);
  const restore=useRef<HTMLButtonElement>(null);
  const surface=useRef<HTMLDivElement>(null);
  const focusOnOpen=useRef(false);
  const closeTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const cancelClose=()=>{if(closeTimer.current!==null){clearTimeout(closeTimer.current);closeTimer.current=null;}};
  const reveal=()=>{cancelClose();setOpen(true);};
  const hide=()=>{
    cancelClose();
    if(root.current?.contains(document.activeElement))restore.current?.focus({preventScroll:true});
    focusOnOpen.current=false;
    setOpen(false);
  };
  const scheduleClose=()=>{
    cancelClose();
    closeTimer.current=setTimeout(()=>{
      const active=document.activeElement;
      // Keyboard navigation stays usable; a mouse-clicked button must not pin the bar.
      if(active&&root.current?.contains(active)&&active.matches(':focus-visible'))return;
      setOpen(false);
    },160);
  };
  useEffect(()=>{
    if(open&&focusOnOpen.current){
      focusOnOpen.current=false;
      surface.current?.querySelector<HTMLElement>('a[href],button:not(:disabled),select')?.focus({preventScroll:true});
    }
  },[open]);
  useEffect(()=>()=>{if(closeTimer.current!==null)clearTimeout(closeTimer.current);},[]);
  return (
    <header ref={root} data-reader-toolbar={open?'visible':'hidden'} className="relative z-30 h-0 w-full shrink-0"
      onPointerEnter={event=>{if(event.pointerType!=='touch')reveal();}}
      onPointerLeave={event=>{if(event.pointerType!=='touch')scheduleClose();}}
      onFocusCapture={event=>{if(event.target.matches(':focus-visible')){if(event.target===restore.current)focusOnOpen.current=true;reveal();}}}
      onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget))scheduleClose();}}
      onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();hide();}}}>
      <div data-toolbar-hover-zone aria-hidden="true" className="absolute inset-x-0 top-0 h-3" />
      <button ref={restore} tabIndex={open?-1:0} type="button" aria-label="展开阅读工具栏" title="展开阅读工具栏" aria-expanded={open}
        className={`absolute right-3 top-2 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-foreground shadow-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary ${open?'pointer-events-none opacity-0':''}`}
        onClick={event=>{if(event.detail===0)focusOnOpen.current=true;reveal();}}><ChevronDown size={17}/></button>
      <div ref={surface} data-toolbar-surface inert={!open} aria-hidden={!open}
        className={`absolute inset-x-0 top-0 border-b border-border bg-card text-foreground shadow-sm transition-[transform,opacity] motion-reduce:transition-none ${open?'translate-y-0 opacity-100 duration-0':'pointer-events-none -translate-y-full opacity-0 duration-150'}`}>
      <div className="flex min-w-0 flex-wrap items-center gap-2 py-3 pl-14 pr-3 sm:pr-5">
        <Link href="/documents" aria-label="返回书库" title="返回书库" className="rounded-md p-2 hover:bg-muted"><ArrowLeft size={17}/></Link>
        <h1 className="min-w-0 basis-full truncate text-sm font-semibold sm:basis-auto sm:flex-1" title={title}>
          {title}
        </h1>
        <div role="group" aria-label={navigationKind==='screen'?'逐屏阅读':'翻页'} className="flex min-w-0 flex-wrap items-center gap-2">
          <button type="button" className={controlClass} aria-label={navigationKind==='screen'?'上一屏':'上一页'} disabled={previousDisabled} onClick={onPrevious}>
            <ChevronLeft aria-hidden="true" className="h-4 w-4" />
            <span className="hidden sm:inline">{navigationKind==='screen'?'上一屏':'上一页'}</span>
          </button>
          {positionLabel && (
            <span aria-live="polite" aria-atomic="true" className="max-w-40 truncate text-center text-xs tabular-nums opacity-75" title={positionLabel}>
              {positionLabel}
            </span>
          )}
          <button type="button" className={controlClass} aria-label={navigationKind==='screen'?'下一屏':'下一页'} disabled={nextDisabled} onClick={onNext}>
            <span className="hidden sm:inline">{navigationKind==='screen'?'下一屏':'下一页'}</span>
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
        <div data-reader-utility role="group" aria-label="阅读操作" className="flex flex-wrap items-center gap-2">
          {onUtility&&<><button type="button" className={controlClass} aria-label="书内搜索" title="书内搜索" onClick={()=>onUtility('search')}><Search size={16}/></button><button type="button" className={controlClass} aria-label="笔记与 AI 阅读" title="笔记与 AI 阅读" onClick={()=>onUtility('notes')}><NotebookPen size={16}/></button><button type="button" className={controlClass} aria-label="阅读设置" title="阅读设置" onClick={()=>onUtility('settings')}><Settings size={16}/></button></>}
          <button type="button" className={controlClass} aria-label="打开目录与书签" onClick={onContents}>
            <List aria-hidden="true" className="h-4 w-4" />
            <span className="hidden lg:inline">目录</span>
          </button>
          <button type="button" className={controlClass} aria-label="添加书签" disabled={bookmarkDisabled} onClick={onBookmark}>
            <BookmarkPlus aria-hidden="true" className="h-4 w-4" />

          </button>
          <button type="button" className={controlClass} aria-label={immersive ? '退出全屏' : '进入全屏'} title={immersive ? '退出全屏' : '进入全屏'} onClick={onFullscreen}>
            {immersive ? <Minimize2 aria-hidden="true" className="h-4 w-4" /> : <Maximize2 aria-hidden="true" className="h-4 w-4" />}
            <span className="hidden sm:inline">{immersive ? '退出全屏' : '全屏'}</span>
          </button>
          <button type="button" className={controlClass} aria-label="收起阅读工具栏" title="收起阅读工具栏" aria-expanded={true} onClick={hide}><ChevronUp size={17}/></button>
        </div>
      </div>
      {children && (
        <div className="flex min-w-0 flex-wrap items-center gap-2 border-t border-border px-3 py-3 sm:px-5 ">
          {children}
        </div>
      )}
      </div>
    </header>
  );
}
