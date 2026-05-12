'use client';

import { type ReactNode } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useReaderStore } from '@/hooks/use-reader-store';

export default function SidebarShell({ children }: { children: ReactNode }) {
  const sidebarCollapsed = useReaderStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useReaderStore((s) => s.setSidebarCollapsed);

  return (
    <div className="relative z-40 shrink-0 transition-all duration-300 ease-in-out" style={{ width: sidebarCollapsed ? 0 : 288 }}>
      <div className="sticky top-0 flex h-[calc(100vh)] w-72 flex-col overflow-hidden">
        {children}
      </div>
      <button
        type="button"
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        className="fixed top-6 z-50 flex h-8 w-8 items-center justify-center rounded-full border border-orange-200/80 bg-white/90 text-orange-700 shadow-md shadow-orange-100/50 transition-all duration-300 ease-in-out hover:bg-orange-100 hover:text-orange-900"
        style={{ left: sidebarCollapsed ? 8 : 296 }}
        title={sidebarCollapsed ? '展开侧边栏 / Expand sidebar' : '收起侧边栏 / Collapse sidebar'}
      >
        {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
      </button>
    </div>
  );
}
