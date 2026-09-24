import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { decrypt } from '@/lib/crypto';
import { appConfigService } from '@/server/app-config/app-config.service';
import { MimoProvider } from '@/server/ai/mimo.provider';

export async function POST() {
  try { await requireAdmin(); }
  catch { return NextResponse.json({error:'Forbidden'}, {status:403}); }
  try {
    const config = await appConfigService.getConfig();
    if (!config.globalMimoApiKeyEncrypted) return NextResponse.json({error:'请先保存 MiMo 密钥'}, {status:400});
    const provider = new MimoProvider({
      apiKey:decrypt(config.globalMimoApiKeyEncrypted),
      baseUrl:config.globalMimoBaseUrl,
      model:config.globalMimoModel,
      temperature:0.3, maxTokens:256, topP:1, timeoutMs:30000, retryCount:0,
    });
    const result = await provider.testConnection();
    const activeForReaders = config.globalAiProvider === 'mimo' && config.shareGlobalDeepSeekWithUsers;
    const message = result.success
      ? `${result.message}。${activeForReaders ? 'MiMo 已设为前端共享模型。' : config.globalAiProvider !== 'mimo' ? '连接成功，但尚未启用 MiMo 为活动模型；请点击保存并启用 MiMo。' : '连接成功，但共享已关闭，普通用户不会使用此配置。'}`
      : result.message;
    return NextResponse.json({...result,message,activeForReaders,provider:'mimo',model:config.globalMimoModel}, {status:result.success ? 200 : 400});
  } catch {
    return NextResponse.json({error:'MiMo 测试失败，请检查已保存的密钥、接入地区和模型配置。'}, {status:400});
  }
}
