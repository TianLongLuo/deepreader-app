import { requireAdmin } from '@/lib/auth';
import { dracConsoleService } from '@/server/admin/dracconsole.service';
import DracConsolePanel from '@/components/admin/dracconsole-panel';

export default async function DracConsolePage() {
  await requireAdmin();
  const snapshot = await dracConsoleService.getSnapshot();

  return (
    <div className="cat-page-shell mx-auto max-w-7xl space-y-8">
      <div className="relative z-10 rounded-[2rem] border border-orange-200/70 bg-white/60 p-6 shadow-xl shadow-orange-200/30 backdrop-blur-xl">
        <div className="mb-3 text-4xl">🐱🛡️</div>
        <h1 className="cat-heading text-4xl font-black tracking-tight">dracconsole</h1>
        <p className="cat-muted mt-2 text-sm font-medium">
          User, document, registration, and AI access controls for this local
          DeepReader instance.
        </p>
      </div>

      <DracConsolePanel initialSnapshot={snapshot} />
    </div>
  );
}
