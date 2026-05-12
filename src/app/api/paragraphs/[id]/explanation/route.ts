import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { appConfigService } from '@/server/app-config/app-config.service';
import { aiExplanationService } from '@/server/ai/explanation.service';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const [aiAccess, appConfig] = await Promise.all([
      appConfigService.getUserAIAccess(user.email),
      appConfigService.getConfig(),
    ]);
    const canUseAi =
      aiAccess.isPrimaryAdmin ||
      aiAccess.canManageOwnAiSettings ||
      aiAccess.canUseSharedGlobalAi ||
      appConfig.shareGlobalDeepSeekWithUsers;

    if (!canUseAi) {
      return NextResponse.json(
        { error: 'AI is currently available only to admin@qq.com.' },
        { status: 403 }
      );
    }

    if (!user.workspaceId) {
      return NextResponse.json({ error: 'No workspace attached' }, { status: 400 });
    }

    const resolvedParams = await params;
    const paragraphId = resolvedParams.id;
    
    const explanation = await aiExplanationService.getExplanation(paragraphId);
    
    if (!explanation) {
      return NextResponse.json({ error: 'Explanation not found' }, { status: 404 });
    }

    return NextResponse.json(explanation);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
