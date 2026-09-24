'use client';

import type { ReactNode } from 'react';
import { BookmarkPlus, ChevronLeft, ChevronRight, List, Maximize2, Minimize2 } from 'lucide-react';

export type ReaderToolbarProps = {
  title: string;
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

const controlClass = 'inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-orange-200/70 px-3 py-2 text-sm font-medium transition-colors hover:bg-orange-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:border-orange-300/20 dark:hover:bg-orange-300/10';

export default function ReaderToolbar({
  title,
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
  return (
    <header className="relative z-20 w-full shrink-0 border-b border-orange-200/70 bg-orange-50/95 text-orange-950 dark:border-orange-300/15 dark:bg-[#1c120d]/95 dark:text-orange-50">
      <div className="flex min-w-0 flex-wrap items-center gap-2 py-3 pl-14 pr-3 sm:pr-5">
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
        <div role="group" aria-label="阅读操作" className="flex flex-wrap items-center gap-2">
          <button type="button" className={controlClass} aria-label="打开目录与书签" onClick={onContents}>
            <List aria-hidden="true" className="h-4 w-4" />
            <span>目录与书签</span>
          </button>
          <button type="button" className={controlClass} aria-label="添加书签" disabled={bookmarkDisabled} onClick={onBookmark}>
            <BookmarkPlus aria-hidden="true" className="h-4 w-4" />
            <span className="hidden sm:inline">添加书签</span>
          </button>
          <button type="button" className={controlClass} aria-label={immersive ? '退出全屏' : '进入全屏'} title={immersive ? '退出全屏' : '进入全屏'} onClick={onFullscreen}>
            {immersive ? <Minimize2 aria-hidden="true" className="h-4 w-4" /> : <Maximize2 aria-hidden="true" className="h-4 w-4" />}
            <span className="hidden sm:inline">{immersive ? '退出全屏' : '全屏'}</span>
          </button>
        </div>
      </div>
      {children && (
        <div className="flex min-w-0 flex-wrap items-center gap-2 border-t border-orange-200/50 px-3 py-3 sm:px-5 dark:border-orange-300/10">
          {children}
        </div>
      )}
    </header>
  );
}
