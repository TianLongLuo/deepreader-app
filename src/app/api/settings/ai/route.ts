import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { aiSettingsService } from '@/server/config/ai-settings.service';
import { appConfigService } from '@/server/app-config/app-config.service';
import { aiProviderSettingsSchema } from '@/types/ai';

export async function GET() {
  try {
    const user = await requireAuth();
    const access = await appConfigService.getUserAIAccess(user.email);

    if (!access.canManageOwnAiSettings) {
      return NextResponse.json(
        { error: 'AI settings are currently available only to admin@qq.com.' },
        { status: 403 }
      );
    }

    if (!user.workspaceId) {
      return NextResponse.json({ error: 'No workspace attached' }, { status: 400 });
    }

    const settings = await aiSettingsService.getSettings(user.workspaceId);
    return NextResponse.json(settings || {});
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const user = await requireAuth();
    const access = await appConfigService.getUserAIAccess(user.email);

    if (!access.canManageOwnAiSettings) {
      return NextResponse.json(
        { error: 'AI settings are currently available only to admin@qq.com.' },
        { status: 403 }
      );
    }

    if (!user.workspaceId) {
      return NextResponse.json({ error: 'No workspace attached' }, { status: 400 });
    }

    const body = await req.json();
    const validatedData = aiProviderSettingsSchema.parse(body);

    const updated = await aiSettingsService.saveSettings(
      user.workspaceId,
      validatedData
    );

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      console.error('Validation Error Details:', JSON.stringify(error, null, 2));
      return NextResponse.json({ error: 'Validation Error', details: error }, { status: 400 });
    }
    console.error('Save Settings Error:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
