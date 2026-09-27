import { requireAdmin } from '@/lib/auth';
import { dracConsoleService } from '@/server/admin/dracconsole.service';
import DracConsolePanel from '@/components/admin/dracconsole-panel';

export default async function DracConsolePage() {
  await requireAdmin();
  const snapshot = await dracConsoleService.getSnapshot();

  return (
    <div className="cat-page-shell mx-auto max-w-7xl space-y-8">
      <div className="relative z-10">

        <h1 className="cat-heading text-3xl font-semibold tracking-tight">管理后台</h1>
        <p className="cat-muted mt-2 text-sm font-medium">
          管理用户、书籍与 AI 服务权限。
        </p>
      </div>

      <DracConsolePanel initialSnapshot={snapshot} />
    </div>
  );
}
