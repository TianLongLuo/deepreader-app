import AppearanceSettings from '@/components/settings/appearance-settings';
import { requireAuth } from '@/lib/auth';
import AISettingsForm from '@/components/settings/ai-settings-form';
import { aiSettingsService } from '@/server/config/ai-settings.service';
import { appConfigService } from '@/server/app-config/app-config.service';
import { redirect } from 'next/navigation';

export default async function AISettingsPage() {
  const user = await requireAuth();
  const access = await appConfigService.getUserAIAccess(user.email);

  const initialData = access.canManageOwnAiSettings ? await aiSettingsService.getSettings(user.workspaceId!) : null;

  return <div className="page-shell max-w-4xl space-y-7"><header><h1 className="text-3xl font-semibold tracking-tight">设置</h1><p className="mt-2 text-sm text-muted-foreground">按照你的习惯，调整阅读空间。</p></header><AppearanceSettings/>{access.canManageOwnAiSettings&&<section className="space-y-4"><h2 className="text-xl font-semibold">AI 服务</h2><AISettingsForm userId={user.id} initialData={initialData||{}}/></section>}</div>;
}
