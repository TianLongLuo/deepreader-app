'use client';

import Link from 'next/link';
import {useUIPreferences} from '@/hooks/use-ui-preferences';
import {Search,Settings,ArrowLeft,NotebookPen} from 'lucide-react';
import type { ReactNode } from 'react';
import { ChevronUp, ChevronDown, BookmarkPlus, ChevronLeft, ChevronRight, List, Maximize2, Minimize2 } from 'lucide-react';

export type ReaderToolbarProps = {
  title: string;
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
  const {toolbarCollapsed,setToolbarCollapsed}=useUIPreferences();
  if(toolbarCollapsed)return <header className="relative z-30 h-0 w-full shrink-0" aria-label="已收起的阅读工具栏"><button type="button" aria-label="展开阅读工具栏" title="展开阅读工具栏" aria-expanded={false} className="absolute right-3 top-2 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-foreground shadow-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary" onClick={()=>setToolbarCollapsed(false)}><ChevronDown size={17}/></button></header>;
  return (
    <header className="relative z-20 w-full shrink-0 border-b border-border bg-card text-foreground   ">
      <div className="flex min-w-0 flex-wrap items-center gap-2 py-3 pl-14 pr-3 sm:pr-5">
        <Link href="/documents" aria-label="返回书库" title="返回书库" className="rounded-md p-2 hover:bg-muted"><ArrowLeft size={17}/></Link>
        <h1 className="min-w-0 basis-full truncate text-sm font-semibold sm:basis-auto sm:flex-1" title={title}>
          {title}
        </h1>
        <div role="group" aria-label="翻页" className="flex min-w-0 flex-wrap items-center gap-2">
          <button type="button" className={controlClass} aria-label="上一页" disabled={previousDisabled} onClick={onPrevious}>
            <ChevronLeft aria-hidden="true" className="h-4 w-4" />
            <span className="hidden sm:inline">上一页</span>
          </button>
          {positionLabel && (
            <span aria-live="polite" aria-atomic="true" className="max-w-40 truncate text-center text-xs tabular-nums opacity-75" title={positionLabel}>
              {positionLabel}
            </span>
          )}
          <button type="button" className={controlClass} aria-label="下一页" disabled={nextDisabled} onClick={onNext}>
            <span className="hidden sm:inline">下一页</span>
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
          <button type="button" className={controlClass} aria-label="收起阅读工具栏" title="收起阅读工具栏" aria-expanded={true} onClick={()=>setToolbarCollapsed(true)}><ChevronUp size={17}/></button>
        </div>
      </div>
      {children && (
        <div className="flex min-w-0 flex-wrap items-center gap-2 border-t border-border px-3 py-3 sm:px-5 ">
          {children}
        </div>
      )}
    </header>
  );
}
