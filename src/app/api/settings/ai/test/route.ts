import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { aiSettingsService } from '@/server/config/ai-settings.service';
import { appConfigService } from '@/server/app-config/app-config.service';
import { z } from 'zod';

const testRequestSchema = z.object({
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  model: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const access = await appConfigService.getUserAIAccess(user.email);

    if (!access.canManageOwnAiSettings) {
      return NextResponse.json(
        {
          success: false,
          message: 'AI settings are currently available only to admin@qq.com.',
        },
        { status: 403 }
      );
    }

    if (!user.workspaceId) {
      return NextResponse.json({ error: 'No workspace attached' }, { status: 400 });
    }

    let payload = {};
    try {
        payload = await req.json();
    } catch {} // Empty body is fine (tests saved settings)
    
    // Only pass keys if testing a draft
    const settings = testRequestSchema.safeParse(payload).success ? payload : undefined;

    const result = await aiSettingsService.testConnection(user.workspaceId, settings);
    
    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }
    
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ 
      success: false, 
      message: (error as Error).message 
    }, { status: 500 });
  }
}
