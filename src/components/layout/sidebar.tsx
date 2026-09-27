import Link from 'next/link';
import { Book, Settings, LogOut, Upload } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { appConfigService } from '@/server/app-config/app-config.service';

export default async function Sidebar() {
  const user = await getCurrentUser();


  return (
    <aside className="flex h-full w-[216px] flex-col border-r border-border bg-background px-3 py-5">
      <Link href="/documents" className="mb-8 flex items-center gap-2 px-3 text-lg font-semibold tracking-tight"><Book className="h-5 w-5 text-primary"/>DeepReader</Link>
      <nav className="flex-1 space-y-1" aria-label="主导航">
        <Link href="/documents" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-muted"><Book className="h-4 w-4"/>书库</Link>
        <Link href="/study" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-muted"><Book className="h-4 w-4"/>学习</Link>
      </nav>
      <nav className="space-y-1 border-t border-border pt-3" aria-label="账户与设置">
        <Link href="/settings/ai" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted"><Settings className="h-4 w-4"/>设置</Link>
        {user?.role==='ADMIN'&&<Link href="/dracconsole" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted"><Settings className="h-4 w-4"/>管理后台</Link>}
      </nav>
      <div className="mt-3 flex items-center gap-2 border-t border-border px-2 pt-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{(user?.name||user?.email||'U').slice(0,1).toUpperCase()}</div>
        <div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{user?.name||'阅读账户'}</p><p className="truncate text-[11px] text-muted-foreground">{user?.email}</p></div>
        <form action={async()=>{'use server';const {cookies}=await import('next/headers');const {logoutUser}=await import('@/lib/auth');await logoutUser();(await cookies()).delete('session_token');const {redirect}=await import('next/navigation');redirect('/login');}}><button type="submit" aria-label="退出登录" className="rounded-md p-2 text-muted-foreground hover:bg-muted"><LogOut className="h-4 w-4"/></button></form>
      </div>
    </aside>
  );
}
