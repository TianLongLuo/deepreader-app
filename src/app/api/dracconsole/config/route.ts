import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import {
  GlobalAIProviderKey,
  appConfigService,
} from '@/server/app-config/app-config.service';

function parseGlobalAIProvider(value: unknown): GlobalAIProviderKey | undefined {
  return value === 'deepseek' || value === 'gemini' ? value : undefined;
}

export async function GET() {
  try {
    await requireAdmin();
    const config = await appConfigService.getAdminConfig();
    return NextResponse.json(config);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = (await req.json()) as {
      allowRegistrations?: unknown;
      globalAiProvider?: unknown;
      shareGlobalDeepSeekWithUsers?: unknown;
      allowUserAiSettings?: unknown;
      globalDeepseekApiKey?: unknown;
      clearGlobalDeepseekApiKey?: unknown;
      globalGeminiApiKey?: unknown;
      clearGlobalGeminiApiKey?: unknown;
      globalGeminiModel?: unknown;
    };
    const nextConfig = await appConfigService.updateConfig({
      allowRegistrations:
        typeof body.allowRegistrations === 'boolean'
          ? body.allowRegistrations
          : undefined,
      globalAiProvider: parseGlobalAIProvider(body.globalAiProvider),
      shareGlobalDeepSeekWithUsers:
        typeof body.shareGlobalDeepSeekWithUsers === 'boolean'
          ? body.shareGlobalDeepSeekWithUsers
          : undefined,
      allowUserAiSettings:
        typeof body.allowUserAiSettings === 'boolean'
          ? body.allowUserAiSettings
          : undefined,
      globalDeepseekApiKey:
        typeof body.globalDeepseekApiKey === 'string'
          ? body.globalDeepseekApiKey
          : undefined,
      clearGlobalDeepseekApiKey:
        typeof body.clearGlobalDeepseekApiKey === 'boolean'
          ? body.clearGlobalDeepseekApiKey
          : undefined,
      globalGeminiApiKey:
        typeof body.globalGeminiApiKey === 'string'
          ? body.globalGeminiApiKey
          : undefined,
      clearGlobalGeminiApiKey:
        typeof body.clearGlobalGeminiApiKey === 'boolean'
          ? body.clearGlobalGeminiApiKey
          : undefined,
      globalGeminiModel:
        typeof body.globalGeminiModel === 'string'
          ? body.globalGeminiModel
          : undefined,
    });
    return NextResponse.json(nextConfig);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }
}
