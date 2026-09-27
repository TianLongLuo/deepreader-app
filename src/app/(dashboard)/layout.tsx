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
    <div className="flex min-h-screen bg-background text-foreground">
      <SidebarShell>
        <Sidebar />
      </SidebarShell>
      <main className="relative min-w-0 flex-1 overflow-auto bg-background">
        {children}
      </main>
    </div>
  );
}
