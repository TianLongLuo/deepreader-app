export const DEFAULT_MIMO_MODEL = 'mimo-v2.6-pro';
export const MIMO_BASE_URLS = {
  payg: 'https://api.xiaomimimo.com/v1',
  cn: 'https://token-plan-cn.xiaomimimo.com/v1',
  sgp: 'https://token-plan-sgp.xiaomimimo.com/v1',
  ams: 'https://token-plan-ams.xiaomimimo.com/v1',
} as const;
export const DEFAULT_MIMO_BASE_URL = MIMO_BASE_URLS.payg;
/** Return a canonical official endpoint, or reject before sending credentials. */
export function validateMimoBaseUrl(value: string): string {
  const normalized = value.trim().replace(/\/$/, '');
  if (!(Object.values(MIMO_BASE_URLS) as string[]).includes(normalized)) {
    throw new Error('MiMo Base URL must be an official HTTPS /v1 endpoint (pay-as-you-go or Token Plan cn/sgp/ams).');
  }
  return normalized;
}
