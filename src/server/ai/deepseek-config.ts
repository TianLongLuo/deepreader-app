export const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
export const DEEPSEEK_V4_PRO_MODEL = 'deepseek-v4-pro';
export const DEEPSEEK_V4_FLASH_MODEL = 'deepseek-v4-flash';
export const DEEPSEEK_V4_MAX_OUTPUT_TOKENS = 384000;
export const DEEPSEEK_V4_LONG_TIMEOUT_MS = 600000;
export const DEFAULT_DEEPSEEK_MODEL = DEEPSEEK_V4_FLASH_MODEL;

const LEGACY_MODEL_MAP: Record<string, string> = {
  'deepseek-chat': DEFAULT_DEEPSEEK_MODEL,
  'deepseek-reasoner': DEFAULT_DEEPSEEK_MODEL,
};

export function resolveDeepSeekModel(model?: string | null): string {
  const normalized = model?.trim();
  if (!normalized) {
    return DEFAULT_DEEPSEEK_MODEL;
  }

  return LEGACY_MODEL_MAP[normalized] || normalized;
}

export function resolveDeepSeekThinking(model?: string | null) {
  return { type: 'disabled' };
}

export function resolveDeepSeekReasoningEffort(model?: string | null) {
  return undefined;
}
