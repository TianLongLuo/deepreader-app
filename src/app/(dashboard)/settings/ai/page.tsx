import { requireAuth } from '@/lib/auth';
import AISettingsForm from '@/components/settings/ai-settings-form';
import { aiSettingsService } from '@/server/config/ai-settings.service';
import { appConfigService } from '@/server/app-config/app-config.service';
import { redirect } from 'next/navigation';

export default async function AISettingsPage() {
  const user = await requireAuth();
  const access = await appConfigService.getUserAIAccess(user.email);

  if (!access.canManageOwnAiSettings) {
    redirect('/documents');
  }

  const initialData = await aiSettingsService.getSettings(user.workspaceId!);

  return (
    <div className="cat-page-shell mx-auto max-w-4xl space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="relative z-10 rounded-[2rem] border border-orange-200/70 bg-white/60 p-6 shadow-xl shadow-orange-200/30 backdrop-blur-xl">
        <div className="mb-3 text-4xl">🐱⚙️</div>
        <h1 className="cat-heading mb-2 text-4xl font-black tracking-tight">AI Configuration</h1>
        <p className="cat-muted font-medium">Tune the clever kitten that helps explain your books.</p>
      </div>
      
      <AISettingsForm initialData={initialData || {}} />
    </div>
  );
}
