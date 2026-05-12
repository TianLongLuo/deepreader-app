import fs from 'fs/promises';
import path from 'path';
import { decrypt, encrypt, maskApiKey } from '@/lib/crypto';
import {
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_DEEPSEEK_MODEL,
} from '@/server/ai/deepseek-config';

export const PRIMARY_ADMIN_EMAIL = 'admin@qq.com';
const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_GEMINI_MODEL = 'gemini-3-flash-preview';
const BUILT_IN_DEEPSEEK_API_KEY_ENCRYPTED =
  '18NETnVN5LT/smZ51iCYgtA9lZ8Sja0Uy8R+wq9NfKKO67K9I/tKF/50+JpLr6VY1DLEfjzL3eYYuA3IHrCDlMr0sg==';
const BUILT_IN_DEEPSEEK_API_KEY_PREVIEW = 'sk-****c077';

export type GlobalAIProviderKey = 'deepseek' | 'gemini';

type StoredAppConfig = {
  allowRegistrations: boolean;
  globalAiProvider: GlobalAIProviderKey;
  shareGlobalDeepSeekWithUsers: boolean;
  allowUserAiSettings: boolean;
  globalDeepseekApiKeyEncrypted: string | null;
  globalDeepseekApiKeyPreview: string | null;
  globalGeminiApiKeyEncrypted: string | null;
  globalGeminiApiKeyPreview: string | null;
  globalGeminiModel: string;
};

export type PublicAppConfig = Pick<StoredAppConfig, 'allowRegistrations'>;

export type AdminAppConfig = {
  allowRegistrations: boolean;
  globalAiProvider: GlobalAIProviderKey;
  shareGlobalDeepSeekWithUsers: boolean;
  allowUserAiSettings: boolean;
  hasGlobalDeepseekApiKey: boolean;
  globalDeepseekApiKeyPreview: string | null;
  hasGlobalGeminiApiKey: boolean;
  globalGeminiApiKeyPreview: string | null;
  globalGeminiModel: string;
};

export type UserAIAccess = {
  isPrimaryAdmin: boolean;
  canManageOwnAiSettings: boolean;
  canUseSharedGlobalAi: boolean;
  hasGlobalDeepseekApiKey: boolean;
};

const DEFAULT_CONFIG: StoredAppConfig = {
  allowRegistrations: true,
  globalAiProvider: 'deepseek',
  shareGlobalDeepSeekWithUsers: true,
  allowUserAiSettings: false,
  globalDeepseekApiKeyEncrypted: BUILT_IN_DEEPSEEK_API_KEY_ENCRYPTED,
  globalDeepseekApiKeyPreview: BUILT_IN_DEEPSEEK_API_KEY_PREVIEW,
  globalGeminiApiKeyEncrypted: null,
  globalGeminiApiKeyPreview: null,
  globalGeminiModel: DEFAULT_GEMINI_MODEL,
};

function getConfigPath() {
  return path.join(process.cwd(), 'storage', 'system', 'app-config.json');
}

async function ensureConfigFile() {
  const configPath = getConfigPath();
  await fs.mkdir(path.dirname(configPath), { recursive: true });

  try {
    await fs.access(configPath);
  } catch {
    await fs.writeFile(
      configPath,
      JSON.stringify(DEFAULT_CONFIG, null, 2),
      'utf8'
    );
  }

  return configPath;
}

export class AppConfigService {
  private normalizeProvider(value: unknown): GlobalAIProviderKey {
    return value === 'gemini' ? 'gemini' : 'deepseek';
  }

  private normalizeConfig(parsed: Partial<StoredAppConfig>): StoredAppConfig {
    return {
      allowRegistrations:
        typeof parsed.allowRegistrations === 'boolean'
          ? parsed.allowRegistrations
          : DEFAULT_CONFIG.allowRegistrations,
      globalAiProvider: this.normalizeProvider(parsed.globalAiProvider),
      shareGlobalDeepSeekWithUsers:
        typeof parsed.shareGlobalDeepSeekWithUsers === 'boolean'
          ? parsed.shareGlobalDeepSeekWithUsers
          : DEFAULT_CONFIG.shareGlobalDeepSeekWithUsers,
      allowUserAiSettings:
        typeof parsed.allowUserAiSettings === 'boolean'
          ? parsed.allowUserAiSettings
          : DEFAULT_CONFIG.allowUserAiSettings,
      globalDeepseekApiKeyEncrypted:
        typeof parsed.globalDeepseekApiKeyEncrypted === 'string' &&
        parsed.globalDeepseekApiKeyEncrypted.length > 0
          ? parsed.globalDeepseekApiKeyEncrypted
          : BUILT_IN_DEEPSEEK_API_KEY_ENCRYPTED,
      globalDeepseekApiKeyPreview:
        typeof parsed.globalDeepseekApiKeyPreview === 'string' &&
        parsed.globalDeepseekApiKeyPreview.length > 0
          ? parsed.globalDeepseekApiKeyPreview
          : BUILT_IN_DEEPSEEK_API_KEY_PREVIEW,
      globalGeminiApiKeyEncrypted:
        typeof parsed.globalGeminiApiKeyEncrypted === 'string' &&
        parsed.globalGeminiApiKeyEncrypted.length > 0
          ? parsed.globalGeminiApiKeyEncrypted
          : null,
      globalGeminiApiKeyPreview:
        typeof parsed.globalGeminiApiKeyPreview === 'string' &&
        parsed.globalGeminiApiKeyPreview.length > 0
          ? parsed.globalGeminiApiKeyPreview
          : null,
      globalGeminiModel:
        typeof parsed.globalGeminiModel === 'string' &&
        parsed.globalGeminiModel.trim().length > 0
          ? parsed.globalGeminiModel.trim()
          : DEFAULT_CONFIG.globalGeminiModel,
    };
  }

  isPrimaryAdminEmail(email?: string | null): boolean {
    return (email || '').trim().toLowerCase() === PRIMARY_ADMIN_EMAIL;
  }

  async getConfig(): Promise<StoredAppConfig> {
    const configPath = await ensureConfigFile();

    try {
      const raw = await fs.readFile(configPath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<StoredAppConfig>;
      return this.normalizeConfig(parsed);
    } catch {
      return DEFAULT_CONFIG;
    }
  }

  async getPublicConfig(): Promise<PublicAppConfig> {
    const config = await this.getConfig();
    return {
      allowRegistrations: config.allowRegistrations,
    };
  }

  async getAdminConfig(): Promise<AdminAppConfig> {
    const config = await this.getConfig();
    return {
      allowRegistrations: config.allowRegistrations,
      globalAiProvider: config.globalAiProvider,
      shareGlobalDeepSeekWithUsers: config.shareGlobalDeepSeekWithUsers,
      allowUserAiSettings: config.allowUserAiSettings,
      hasGlobalDeepseekApiKey: Boolean(config.globalDeepseekApiKeyEncrypted),
      globalDeepseekApiKeyPreview: config.globalDeepseekApiKeyPreview,
      hasGlobalGeminiApiKey: Boolean(config.globalGeminiApiKeyEncrypted),
      globalGeminiApiKeyPreview: config.globalGeminiApiKeyPreview,
      globalGeminiModel: config.globalGeminiModel,
    };
  }

  async getUserAIAccess(email?: string | null): Promise<UserAIAccess> {
    const config = await this.getConfig();
    const isPrimaryAdmin = this.isPrimaryAdminEmail(email);
    const selectedProviderHasKey =
      config.globalAiProvider === 'gemini'
        ? Boolean(config.globalGeminiApiKeyEncrypted)
        : Boolean(config.globalDeepseekApiKeyEncrypted);

    return {
      isPrimaryAdmin,
      canManageOwnAiSettings: isPrimaryAdmin || config.allowUserAiSettings,
      canUseSharedGlobalAi:
        selectedProviderHasKey &&
        (isPrimaryAdmin || config.shareGlobalDeepSeekWithUsers),
      hasGlobalDeepseekApiKey:
        config.globalAiProvider === 'gemini'
          ? Boolean(config.globalGeminiApiKeyEncrypted)
          : Boolean(config.globalDeepseekApiKeyEncrypted),
    };
  }

  async updateConfig(input: {
    allowRegistrations?: boolean;
    globalAiProvider?: GlobalAIProviderKey;
    shareGlobalDeepSeekWithUsers?: boolean;
    allowUserAiSettings?: boolean;
    globalDeepseekApiKey?: string;
    clearGlobalDeepseekApiKey?: boolean;
    globalGeminiApiKey?: string;
    clearGlobalGeminiApiKey?: boolean;
    globalGeminiModel?: string;
  }): Promise<AdminAppConfig> {
    const current = await this.getConfig();
    const nextConfig: StoredAppConfig = {
      ...current,
    };

    if (typeof input.allowRegistrations === 'boolean') {
      nextConfig.allowRegistrations = input.allowRegistrations;
    }

    if (input.globalAiProvider) {
      nextConfig.globalAiProvider = this.normalizeProvider(input.globalAiProvider);
    }

    if (typeof input.shareGlobalDeepSeekWithUsers === 'boolean') {
      nextConfig.shareGlobalDeepSeekWithUsers =
        input.shareGlobalDeepSeekWithUsers;
    }

    if (typeof input.allowUserAiSettings === 'boolean') {
      nextConfig.allowUserAiSettings = input.allowUserAiSettings;
    }

    if (input.clearGlobalDeepseekApiKey) {
      nextConfig.globalDeepseekApiKeyEncrypted = null;
      nextConfig.globalDeepseekApiKeyPreview = null;
    } else if (
      typeof input.globalDeepseekApiKey === 'string' &&
      input.globalDeepseekApiKey.trim().length > 0
    ) {
      const normalizedApiKey = input.globalDeepseekApiKey.trim();
      nextConfig.globalDeepseekApiKeyEncrypted = encrypt(normalizedApiKey);
      nextConfig.globalDeepseekApiKeyPreview = maskApiKey(normalizedApiKey);
    }

    if (input.clearGlobalGeminiApiKey) {
      nextConfig.globalGeminiApiKeyEncrypted = null;
      nextConfig.globalGeminiApiKeyPreview = null;
    } else if (
      typeof input.globalGeminiApiKey === 'string' &&
      input.globalGeminiApiKey.trim().length > 0
    ) {
      const normalizedApiKey = input.globalGeminiApiKey.trim();
      nextConfig.globalGeminiApiKeyEncrypted = encrypt(normalizedApiKey);
      nextConfig.globalGeminiApiKeyPreview = maskApiKey(normalizedApiKey);
    }

    if (
      typeof input.globalGeminiModel === 'string' &&
      input.globalGeminiModel.trim().length > 0
    ) {
      nextConfig.globalGeminiModel = input.globalGeminiModel.trim();
    }

    const configPath = await ensureConfigFile();
    await fs.writeFile(configPath, JSON.stringify(nextConfig, null, 2), 'utf8');
    return {
      allowRegistrations: nextConfig.allowRegistrations,
      globalAiProvider: nextConfig.globalAiProvider,
      shareGlobalDeepSeekWithUsers: nextConfig.shareGlobalDeepSeekWithUsers,
      allowUserAiSettings: nextConfig.allowUserAiSettings,
      hasGlobalDeepseekApiKey: Boolean(nextConfig.globalDeepseekApiKeyEncrypted),
      globalDeepseekApiKeyPreview: nextConfig.globalDeepseekApiKeyPreview,
      hasGlobalGeminiApiKey: Boolean(nextConfig.globalGeminiApiKeyEncrypted),
      globalGeminiApiKeyPreview: nextConfig.globalGeminiApiKeyPreview,
      globalGeminiModel: nextConfig.globalGeminiModel,
    };
  }

  async getGlobalAIConfig(): Promise<{
    providerKey: GlobalAIProviderKey;
    apiKey: string;
    baseUrl: string;
    model: string;
  } | null> {
    const config = await this.getConfig();

    if (config.globalAiProvider === 'gemini') {
      if (!config.globalGeminiApiKeyEncrypted) {
        return null;
      }

      return {
        providerKey: 'gemini',
        apiKey: decrypt(config.globalGeminiApiKeyEncrypted),
        baseUrl: DEFAULT_GEMINI_BASE_URL,
        model: config.globalGeminiModel || DEFAULT_GEMINI_MODEL,
      };
    }

    if (!config.globalDeepseekApiKeyEncrypted) {
      return null;
    }

    return {
      providerKey: 'deepseek',
      apiKey: decrypt(config.globalDeepseekApiKeyEncrypted),
      baseUrl: DEFAULT_DEEPSEEK_BASE_URL,
      model: DEFAULT_DEEPSEEK_MODEL,
    };
  }

  async getGlobalDeepSeekConfig(): Promise<{
    apiKey: string;
    baseUrl: string;
    model: string;
  } | null> {
    const config = await this.getConfig();

    if (!config.globalDeepseekApiKeyEncrypted) {
      return null;
    }

    return {
      apiKey: decrypt(config.globalDeepseekApiKeyEncrypted),
      baseUrl: DEFAULT_DEEPSEEK_BASE_URL,
      model: DEFAULT_DEEPSEEK_MODEL,
    };
  }
}

export const appConfigService = new AppConfigService();
