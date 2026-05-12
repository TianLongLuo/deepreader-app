import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import Sidebar from '@/components/layout/sidebar';
import SidebarShell from '@/components/layout/sidebar-shell';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  return (
    <div className="flex min-h-screen bg-[#fff7ed] text-orange-950">
      <SidebarShell>
        <Sidebar />
      </SidebarShell>
      <main className="relative flex-1 overflow-auto bg-[radial-gradient(circle_at_15%_15%,rgba(251,191,36,0.22),transparent_28%),radial-gradient(circle_at_90%_10%,rgba(251,146,60,0.20),transparent_30%),radial-gradient(circle_at_50%_100%,rgba(253,186,116,0.26),transparent_36%)]">
        {children}
      </main>
    </div>
  );
}
