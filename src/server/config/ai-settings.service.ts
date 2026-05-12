import { prisma } from '@/lib/prisma';
import { encrypt, decrypt, maskApiKey, hashSettings } from '@/lib/crypto';
import { createChildLogger } from '@/lib/logger';
import { DeepSeekProvider } from '../ai/deepseek.provider';
import {
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_DEEPSEEK_MODEL,
  DEEPSEEK_V4_LONG_TIMEOUT_MS,
  resolveDeepSeekModel,
} from '../ai/deepseek-config';
import { AISettingsDTO } from '@/types/settings';
import { AIProviderSettings } from '@/types/ai';

const log = createChildLogger('ai-settings-service');

/**
 * Service for managing AI provider settings with secure storage.
 */
export class AISettingsService {
  /**
   * Get AI settings for a workspace (masked API key).
   */
  async getSettings(workspaceId: string): Promise<AISettingsDTO | null> {
    const config = await prisma.aIProviderConfig.findFirst({
      where: { workspaceId },
      orderBy: [{ isDefault: 'desc' }, { priority: 'asc' }],
    });

    if (!config) return null;

    return this.toDTO(config);
  }

  /**
   * Save or update AI provider settings.
   */
  async saveSettings(
    workspaceId: string,
    settings: AIProviderSettings
  ): Promise<AISettingsDTO> {
    const existing = await prisma.aIProviderConfig.findUnique({
      where: {
        workspaceId_providerKey: {
          workspaceId,
          providerKey: settings.providerKey,
        },
      },
    });

    let encryptedApiKey: string;
    let maskedPreview: string;

    if (settings.apiKey && settings.apiKey.trim().length > 0) {
      // New API key provided
      encryptedApiKey = encrypt(settings.apiKey);
      maskedPreview = maskApiKey(settings.apiKey);
    } else if (existing) {
      // Keep existing API key
      encryptedApiKey = existing.encryptedApiKey;
      maskedPreview = existing.maskedApiKeyPreview;
    } else {
      throw new Error('API key is required for new provider configuration');
    }

    const data = {
      isEnabled: settings.isEnabled,
      baseUrl: settings.baseUrl || DEFAULT_DEEPSEEK_BASE_URL,
      encryptedApiKey,
      maskedApiKeyPreview: maskedPreview,
      model:
        settings.providerKey === 'deepseek'
          ? resolveDeepSeekModel(settings.model)
          : settings.model,
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
      topP: settings.topP,
      timeoutMs: settings.timeoutMs,
      retryCount: settings.retryCount,
      streamingEnabled: settings.streamingEnabled,
      saveRawPrompt: settings.saveRawPrompt,
      saveRawResponse: settings.saveRawResponse,
      saveRequestInput: settings.saveRequestInput,
      cacheEnabled: settings.cacheEnabled,
      isDefault: settings.isDefault ?? true,
      priority: settings.priority ?? 0,
    };

    const result = existing
      ? await prisma.aIProviderConfig.update({
          where: { id: existing.id },
          data,
        })
      : await prisma.aIProviderConfig.create({
          data: {
            ...data,
            workspaceId,
            providerKey: settings.providerKey,
          },
        });

    log.info(
      { workspaceId, providerKey: settings.providerKey },
      'AI settings saved'
    );

    return this.toDTO(result);
  }

  /**
   * Test connection with current or provided settings.
   */
  async testConnection(
    workspaceId: string,
    settings?: Partial<AIProviderSettings>
  ): Promise<{
    success: boolean;
    message: string;
    latencyMs: number;
    testedAt: string;
  }> {
    let apiKey: string;
    let baseUrl: string;
    let model: string;
    let timeoutMs: number;

    if (settings?.apiKey) {
      // Test with provided settings
      apiKey = settings.apiKey;
      baseUrl = settings.baseUrl || DEFAULT_DEEPSEEK_BASE_URL;
      model = resolveDeepSeekModel(settings.model || DEFAULT_DEEPSEEK_MODEL);
      timeoutMs = settings.timeoutMs || DEEPSEEK_V4_LONG_TIMEOUT_MS;
    } else {
      // Test with saved settings
      const config = await prisma.aIProviderConfig.findFirst({
        where: { workspaceId },
      });

      if (!config) {
        return {
          success: false,
          message: 'No AI provider configured',
          latencyMs: 0,
          testedAt: new Date().toISOString(),
        };
      }

      apiKey = decrypt(config.encryptedApiKey);
      baseUrl = config.baseUrl;
      model = resolveDeepSeekModel(config.model);
      timeoutMs = config.timeoutMs;
    }

    const provider = new DeepSeekProvider({
      baseUrl,
      apiKey,
      model,
      temperature: 0,
      maxTokens: 20,
      topP: 1,
      timeoutMs,
      retryCount: 0,
    });

    const result = await provider.testConnection();
    const testedAt = new Date().toISOString();

    // Update last test info in DB
    const config = await prisma.aIProviderConfig.findFirst({
      where: { workspaceId },
    });

    if (config) {
      await prisma.aIProviderConfig.update({
        where: { id: config.id },
        data: {
          lastTestedAt: new Date(),
          lastTestStatus: result.success ? 'SUCCESS' : 'FAILED',
          lastTestMessage: result.message,
        },
      });
    }

    return { ...result, testedAt };
  }

  private toDTO(config: {
    id: string;
    providerKey: string;
    isEnabled: boolean;
    baseUrl: string;
    maskedApiKeyPreview: string;
    model: string;
    temperature: number;
    maxTokens: number;
    topP: number;
    timeoutMs: number;
    retryCount: number;
    streamingEnabled: boolean;
    saveRawPrompt: boolean;
    saveRawResponse: boolean;
    saveRequestInput: boolean;
    cacheEnabled: boolean;
    isDefault: boolean;
    priority: number;
    lastTestedAt: Date | null;
    lastTestStatus: string | null;
    lastTestMessage: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): AISettingsDTO {
    return {
      id: config.id,
      providerKey: config.providerKey,
      isEnabled: config.isEnabled,
      baseUrl: config.baseUrl,
      maskedApiKeyPreview: config.maskedApiKeyPreview,
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      topP: config.topP,
      timeoutMs: config.timeoutMs,
      retryCount: config.retryCount,
      streamingEnabled: config.streamingEnabled,
      saveRawPrompt: config.saveRawPrompt,
      saveRawResponse: config.saveRawResponse,
      saveRequestInput: config.saveRequestInput,
      cacheEnabled: config.cacheEnabled,
      isDefault: config.isDefault,
      priority: config.priority,
      lastTestedAt: config.lastTestedAt?.toISOString() || null,
      lastTestStatus: config.lastTestStatus,
      lastTestMessage: config.lastTestMessage,
      createdAt: config.createdAt.toISOString(),
      updatedAt: config.updatedAt.toISOString(),
    };
  }
}

export const aiSettingsService = new AISettingsService();
