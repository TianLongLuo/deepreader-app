import Link from 'next/link';
import { Book, Settings, LogOut, Upload } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { appConfigService } from '@/server/app-config/app-config.service';

export default async function Sidebar() {
  const user = await getCurrentUser();
  const aiAccess = await appConfigService.getUserAIAccess(user?.email);

  return (
    <div className="flex h-full w-72 flex-col border-r border-orange-200/70 bg-white/75 pt-6 shadow-xl shadow-orange-200/30 backdrop-blur-xl">
      <div className="mb-8 flex items-center space-x-3 px-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-white bg-gradient-to-br from-orange-200 via-amber-100 to-rose-100 text-3xl shadow-lg shadow-orange-100">
          🐱
        </div>
        <div>
          <span className="block text-xl font-black tracking-tight text-orange-950">DeepReader</span>
          <span className="text-xs font-semibold text-orange-700/65">cozy reading den</span>
        </div>
      </div>

      <nav className="flex-1 space-y-2 px-4">
        <Link href="/documents" className="group flex items-center space-x-3 rounded-2xl px-4 py-3 text-orange-900/70 transition-all hover:-translate-y-0.5 hover:bg-orange-100/80 hover:text-orange-950 hover:shadow-md hover:shadow-orange-100">
          <Book className="h-5 w-5 text-orange-600 transition-colors group-hover:text-orange-700" />
          <span className="font-semibold">My Library</span>
        </Link>
        <Link href="/upload" className="group flex items-center space-x-3 rounded-2xl px-4 py-3 text-orange-900/70 transition-all hover:-translate-y-0.5 hover:bg-orange-100/80 hover:text-orange-950 hover:shadow-md hover:shadow-orange-100">
          <Upload className="h-5 w-5 text-orange-600 transition-colors group-hover:text-orange-700" />
          <span className="font-semibold">Upload File</span>
        </Link>

        {aiAccess.canManageOwnAiSettings ? (
          <div className="mt-6 border-t border-orange-200/70 pt-6">
            <p className="mb-2 px-4 text-xs font-bold uppercase tracking-wider text-orange-900/45">Configuration</p>
            <Link href="/settings/ai" className="group flex items-center space-x-3 rounded-2xl px-4 py-3 text-orange-900/70 transition-all hover:-translate-y-0.5 hover:bg-orange-100/80 hover:text-orange-950 hover:shadow-md hover:shadow-orange-100">
              <Settings className="h-5 w-5 text-orange-600 transition-colors group-hover:text-orange-700" />
              <span className="font-semibold">AI Settings</span>
            </Link>
          </div>
        ) : null}
      </nav>

      <div className="border-t border-orange-200/70 p-4">
        <div className="rounded-3xl bg-orange-50/80 p-3 shadow-inner shadow-orange-100">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-200 text-xl">🐾</div>
              <div className="flex min-w-0 flex-col overflow-hidden">
                <span className="truncate text-sm font-bold text-orange-950">{user?.name}</span>
                <span className="truncate text-xs text-orange-900/55">{user?.email}</span>
              </div>
            </div>
            <form action={async () => {
              'use server';
              const { cookies } = await import('next/headers');
              const { logoutUser } = await import('@/lib/auth');
              await logoutUser();
              const cookieStore = await cookies();
              cookieStore.delete('session_token');
            }}>
              <button type="submit" className="rounded-full p-2 text-orange-700 transition-colors hover:bg-red-100 hover:text-red-600">
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
