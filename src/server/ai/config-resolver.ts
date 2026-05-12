import { prisma } from '@/lib/prisma';
import { decrypt, hashSettings } from '@/lib/crypto';
import { createChildLogger } from '@/lib/logger';
import { AIProviderInterface } from '@/types/ai';
import { DeepSeekProvider } from './deepseek.provider';
import { GeminiProvider } from './gemini.provider';
import {
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_DEEPSEEK_MODEL,
  DEEPSEEK_V4_LONG_TIMEOUT_MS,
  DEEPSEEK_V4_MAX_OUTPUT_TOKENS,
  resolveDeepSeekModel,
} from './deepseek-config';
import {
  PRIMARY_ADMIN_EMAIL,
  appConfigService,
} from '@/server/app-config/app-config.service';

const log = createChildLogger('ai-config-resolver');

const GLOBAL_DEEPSEEK_DEFAULTS = {
  providerKey: 'deepseek',
  baseUrl: DEFAULT_DEEPSEEK_BASE_URL,
  model: DEFAULT_DEEPSEEK_MODEL,
  temperature: 0.3,
  maxTokens: DEEPSEEK_V4_MAX_OUTPUT_TOKENS,
  topP: 1,
  timeoutMs: DEEPSEEK_V4_LONG_TIMEOUT_MS,
  retryCount: 3,
  saveRawPrompt: false,
  saveRawResponse: false,
  saveRequestInput: false,
  cacheEnabled: true,
} as const;

const GLOBAL_GEMINI_DEFAULTS = {
  providerKey: 'gemini',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  model: 'gemini-3-flash-preview',
  temperature: 0.2,
  maxTokens: 3072,
  topP: 0.95,
  timeoutMs: 120000,
  retryCount: 2,
  saveRawPrompt: false,
  saveRawResponse: false,
  saveRequestInput: false,
  cacheEnabled: true,
} as const;

export interface ResolvedAIConfig {
  provider: AIProviderInterface;
  providerKey: string;
  model: string;
  maxTokens: number;
  promptVersion: string;
  settingsHash: string;
  saveRawPrompt: boolean;
  saveRawResponse: boolean;
  saveRequestInput: boolean;
  cacheEnabled: boolean;
}

/**
 * Resolves AI provider configuration from database settings.
 * Priority: user override -> workspace default -> environment fallback
 */
export class AIConfigResolver {
  /**
   * Resolve the active AI provider and configuration for a workspace.
   */
  async resolve(
    workspaceId: string,
    actorEmail?: string | null
  ): Promise<ResolvedAIConfig> {
    const [workspaceConfig, activeTemplate, appConfig, aiAccess, adminWorkspaceConfig] =
      await Promise.all([
        prisma.aIProviderConfig.findFirst({
          where: {
            workspaceId,
            isEnabled: true,
          },
          orderBy: [{ isDefault: 'desc' }, { priority: 'asc' }],
        }),
        prisma.promptTemplate.findFirst({
          where: {
            workspaceId,
            templateType: 'PARAGRAPH_EXPLANATION',
            isActive: true,
          },
        }),
        appConfigService.getConfig(),
        appConfigService.getUserAIAccess(actorEmail),
        prisma.user
          .findUnique({
            where: { email: PRIMARY_ADMIN_EMAIL },
            select: {
              workspaceMembers: {
                orderBy: [{ createdAt: 'asc' }],
                take: 1,
                select: {
                  workspaceId: true,
                },
              },
            },
          })
          .then(async (adminUser) => {
            const adminWorkspaceId = adminUser?.workspaceMembers[0]?.workspaceId;
            if (!adminWorkspaceId) {
              return null;
            }

            return prisma.aIProviderConfig.findFirst({
              where: {
                workspaceId: adminWorkspaceId,
                isEnabled: true,
              },
              orderBy: [{ isDefault: 'desc' }, { priority: 'asc' }],
            });
          }),
      ]);

    let providerKey: string;
    let model: string;
    let resolvedMaxTokens: number;
    let baseUrl: string;
    let temperature: number;
    let maxTokens: number;
    let topP: number;
    let timeoutMs: number;
    let retryCount: number;
    let saveRawPrompt: boolean;
    let saveRawResponse: boolean;
    let saveRequestInput: boolean;
    let cacheEnabled: boolean;
    let apiKey: string;

    const workspaceConfigAllowed = aiAccess.canManageOwnAiSettings
      ? workspaceConfig
      : null;
    const selectedProviderHasGlobalKey =
      appConfig.globalAiProvider === 'gemini'
        ? Boolean(appConfig.globalGeminiApiKeyEncrypted)
        : Boolean(appConfig.globalDeepseekApiKeyEncrypted);
    const canUseGlobalConfig =
      selectedProviderHasGlobalKey &&
      (aiAccess.isPrimaryAdmin || appConfig.shareGlobalDeepSeekWithUsers);
    const shouldForceGlobalConfig = Boolean(
      appConfig.shareGlobalDeepSeekWithUsers &&
        selectedProviderHasGlobalKey
    );
    const canUseAdminFallback = Boolean(
      appConfig.shareGlobalDeepSeekWithUsers && adminWorkspaceConfig
    );

    if (shouldForceGlobalConfig) {
      const globalConfig = await appConfigService.getGlobalAIConfig();

      if (!globalConfig) {
        throw new Error('Global AI API key is not configured in dracconsole.');
      }

      const defaults =
        globalConfig.providerKey === 'gemini'
          ? GLOBAL_GEMINI_DEFAULTS
          : GLOBAL_DEEPSEEK_DEFAULTS;

      providerKey = globalConfig.providerKey;
      model =
        globalConfig.providerKey === 'deepseek'
          ? resolveDeepSeekModel(globalConfig.model)
          : globalConfig.model;
      resolvedMaxTokens = defaults.maxTokens;
      baseUrl = globalConfig.baseUrl;
      temperature = defaults.temperature;
      maxTokens = defaults.maxTokens;
      topP = defaults.topP;
      timeoutMs = defaults.timeoutMs;
      retryCount = defaults.retryCount;
      saveRawPrompt = defaults.saveRawPrompt;
      saveRawResponse = defaults.saveRawResponse;
      saveRequestInput = defaults.saveRequestInput;
      cacheEnabled = defaults.cacheEnabled;
      apiKey = globalConfig.apiKey;
    } else if (canUseAdminFallback) {
      const adminConfig = adminWorkspaceConfig!;
      providerKey = adminConfig.providerKey;
      model =
        adminConfig.providerKey === 'deepseek'
          ? resolveDeepSeekModel(adminConfig.model)
          : adminConfig.model;
      resolvedMaxTokens = adminConfig.maxTokens;
      baseUrl = adminConfig.baseUrl;
      temperature = adminConfig.temperature;
      maxTokens = adminConfig.maxTokens;
      topP = adminConfig.topP;
      timeoutMs = adminConfig.timeoutMs;
      retryCount = adminConfig.retryCount;
      saveRawPrompt = adminConfig.saveRawPrompt;
      saveRawResponse = adminConfig.saveRawResponse;
      saveRequestInput = adminConfig.saveRequestInput;
      cacheEnabled = adminConfig.cacheEnabled;

      try {
        apiKey = decrypt(adminConfig.encryptedApiKey);
      } catch (error) {
        log.error(
          { providerKey: adminConfig.providerKey },
          'Failed to decrypt admin fallback API key'
        );
        throw new Error(
          'Failed to decrypt the admin AI configuration. Please re-enter the admin API key in Settings.'
        );
      }
    } else if (workspaceConfigAllowed) {
      providerKey = workspaceConfigAllowed.providerKey;
      model =
        workspaceConfigAllowed.providerKey === 'deepseek'
          ? resolveDeepSeekModel(workspaceConfigAllowed.model)
          : workspaceConfigAllowed.model;
      resolvedMaxTokens = workspaceConfigAllowed.maxTokens;
      baseUrl = workspaceConfigAllowed.baseUrl;
      temperature = workspaceConfigAllowed.temperature;
      maxTokens = workspaceConfigAllowed.maxTokens;
      topP = workspaceConfigAllowed.topP;
      timeoutMs = workspaceConfigAllowed.timeoutMs;
      retryCount = workspaceConfigAllowed.retryCount;
      saveRawPrompt = workspaceConfigAllowed.saveRawPrompt;
      saveRawResponse = workspaceConfigAllowed.saveRawResponse;
      saveRequestInput = workspaceConfigAllowed.saveRequestInput;
      cacheEnabled = workspaceConfigAllowed.cacheEnabled;

      try {
        apiKey = decrypt(workspaceConfigAllowed.encryptedApiKey);
      } catch (error) {
        log.error(
          { providerKey: workspaceConfigAllowed.providerKey },
          'Failed to decrypt API key'
        );
        throw new Error(
          'Failed to decrypt API key. Please re-enter your API key in settings.'
        );
      }
    } else if (canUseGlobalConfig) {
      const globalConfig = await appConfigService.getGlobalAIConfig();

      if (!globalConfig) {
        throw new Error('Global AI API key is not configured in dracconsole.');
      }

      const defaults =
        globalConfig.providerKey === 'gemini'
          ? GLOBAL_GEMINI_DEFAULTS
          : GLOBAL_DEEPSEEK_DEFAULTS;

      providerKey = globalConfig.providerKey;
      model =
        globalConfig.providerKey === 'deepseek'
          ? resolveDeepSeekModel(globalConfig.model)
          : globalConfig.model;
      resolvedMaxTokens = defaults.maxTokens;
      baseUrl = globalConfig.baseUrl;
      temperature = defaults.temperature;
      maxTokens = defaults.maxTokens;
      topP = defaults.topP;
      timeoutMs = defaults.timeoutMs;
      retryCount = defaults.retryCount;
      saveRawPrompt = defaults.saveRawPrompt;
      saveRawResponse = defaults.saveRawResponse;
      saveRequestInput = defaults.saveRequestInput;
      cacheEnabled = defaults.cacheEnabled;
      apiKey = globalConfig.apiKey;
    } else if (!aiAccess.isPrimaryAdmin) {
      if (appConfig.shareGlobalDeepSeekWithUsers) {
        throw new Error(
          'Global AI sharing is enabled, but neither a dracconsole global key nor an admin@qq.com AI setting is configured.'
        );
      }

      if (appConfig.allowUserAiSettings) {
        throw new Error(
          'No AI provider configured. Please configure an AI provider in Settings → AI.'
        );
      }

      throw new Error(`AI is currently available only to ${PRIMARY_ADMIN_EMAIL}.`);
    } else {
      throw new Error(
        'No AI provider configured. Please configure an AI provider in Settings → AI or save a global DeepSeek API key in dracconsole.'
      );
    }

    // Get active prompt template version
    const promptVersion = activeTemplate?.version || '1.0.0';

    // Create provider instance
    const provider = this.createProvider(providerKey, {
      baseUrl,
      apiKey,
      model,
      temperature,
      maxTokens,
      topP,
      timeoutMs,
      retryCount,
    });

    // Generate settings hash for cache invalidation
    const settingsHashValue = hashSettings({
      providerKey,
      model,
      temperature,
      maxTokens,
      topP,
    });

    return {
      provider,
      providerKey,
      model,
      maxTokens: resolvedMaxTokens,
      promptVersion,
      settingsHash: settingsHashValue,
      saveRawPrompt,
      saveRawResponse,
      saveRequestInput,
      cacheEnabled,
    };
  }

  private createProvider(
    providerKey: string,
    config: {
      baseUrl: string;
      apiKey: string;
      model: string;
      temperature: number;
      maxTokens: number;
      topP: number;
      timeoutMs: number;
      retryCount: number;
    }
  ): AIProviderInterface {
    switch (providerKey) {
      case 'deepseek':
        return new DeepSeekProvider(config);
      case 'gemini':
        return new GeminiProvider(config);
      default:
        throw new Error(`Unsupported AI provider: ${providerKey}`);
    }
  }
}

export const aiConfigResolver = new AIConfigResolver();
