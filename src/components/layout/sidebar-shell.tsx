"use client";

import { useEffect, useState, type ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useReaderStore } from "@/hooks/use-reader-store";

export default function SidebarShell({ children }: { children: ReactNode }) {
  const sidebarCollapsed = useReaderStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useReaderStore((s) => s.setSidebarCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, []);

  return (
    <>
      {mobileOpen && (
        <button
          aria-label="关闭导航遮罩"
          className="fixed inset-0 z-40 bg-black/35 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-72 transition-transform md:relative md:z-40 md:shrink-0 md:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"} ${sidebarCollapsed ? "md:w-0" : "md:w-72"}`}
      >
        <div
          className={`sticky top-0 flex h-screen w-72 flex-col overflow-hidden ${mobileOpen ? "visible" : "invisible"} ${sidebarCollapsed ? "md:invisible" : "md:visible"}`}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("a"))
              setMobileOpen(false);
          }}
        >
          {children}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label={mobileOpen ? "关闭导航" : "打开导航"}
        className="fixed left-2 top-3 z-[55] flex h-9 w-9 items-center justify-center rounded-full border border-orange-200 bg-white text-orange-700 shadow md:hidden"
      >
        {mobileOpen ? (
          <PanelLeftClose className="h-4 w-4" />
        ) : (
          <PanelLeftOpen className="h-4 w-4" />
        )}
      </button>
      <button
        type="button"
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        className="fixed top-6 z-50 hidden h-8 w-8 items-center justify-center rounded-full border border-orange-200/80 bg-white/90 text-orange-700 shadow-md shadow-orange-100/50 transition-all duration-300 ease-in-out hover:bg-orange-100 hover:text-orange-900 md:flex"
        style={{ left: sidebarCollapsed ? 8 : 296 }}
        title={
          sidebarCollapsed
            ? "展开侧边栏 / Expand sidebar"
            : "收起侧边栏 / Collapse sidebar"
        }
      >
        {sidebarCollapsed ? (
          <PanelLeftOpen className="h-4 w-4" />
        ) : (
          <PanelLeftClose className="h-4 w-4" />
        )}
      </button>
    </>
  );
}
