import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  disk: '{}', workspace: vi.fn(), user: vi.fn(), document: vi.fn(), fetch: vi.fn(),
  auth: vi.fn(), read: vi.fn(), write: vi.fn(), update: vi.fn(),
}));
vi.mock('fs/promises', () => ({ default: { mkdir: vi.fn(), access: vi.fn(), readFile: mocks.read, writeFile: mocks.write } }));
vi.mock('@/lib/crypto', () => ({
  encrypt: (key: string) => 'encrypted:' + key,
  decrypt: (key: string) => key.replace(/^encrypted:/, ''),
  maskApiKey: () => 'sk-****fixture', hashSettings: (value: unknown) => JSON.stringify(value),
}));
vi.mock('@/lib/auth', () => ({ requireAuth: mocks.auth }));
vi.mock('@/lib/prisma', () => ({ prisma: {
  aIProviderConfig: { findFirst: mocks.workspace, update: mocks.update },
  promptTemplate: { findFirst: vi.fn().mockResolvedValue(null) },
  user: { findUnique: mocks.user }, document: { findFirst: mocks.document },
} }));
vi.mock('@/lib/logger', () => ({ createChildLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));

import { appConfigService } from '@/server/app-config/app-config.service';
import { aiConfigResolver } from '@/server/ai/config-resolver';
import { POST as testSaved } from '@/app/api/settings/ai/test/route';
import { POST as reading } from '@/app/api/reading-assistant/route';
import { POST as meaningGroups } from '@/app/api/meaning-groups/route';
import { POST as semanticFlip } from '@/app/api/semantic-flip/route';
import { consumeAIStream } from '@/lib/ai-stream';

const personalA = {
  id: 'settings-a', providerKey: 'deepseek', isEnabled: true,
  baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash',
  encryptedApiKey: 'encrypted:sk-fixture-personal-a', maxTokens: 4096,
  temperature: 0.3, topP: 1, timeoutMs: 1000, retryCount: 0,
  cacheEnabled: false, saveRawPrompt: false, saveRawResponse: false, saveRequestInput: false,
};
const records = new Map<string, typeof personalA>();
let serial = 0;
const text = 'The car slows beside me.';
const request = (path: string, body: unknown, stream = false) => new Request('http://localhost/api/' + path, {
  method: 'POST', body: JSON.stringify(body), headers: stream ? { Accept: 'application/x-ndjson' } : {},
});
const wordBody = { documentId: 'doc', mode: 'word', text, targetWord: 'slows', language: 'Chinese', definitionMode: 'bilingual' };

beforeEach(() => {
  vi.clearAllMocks(); serial++; records.clear(); records.set('workspace-a', { ...personalA });
  mocks.disk = '{}'; mocks.read.mockImplementation(async () => mocks.disk);
  mocks.write.mockImplementation(async (_path: string, value: string) => { mocks.disk = value; });
  mocks.workspace.mockImplementation(async ({ where }: { where: { workspaceId: string; isEnabled?: boolean } }) => {
    const record = records.get(where.workspaceId);
    return record && (!where.isEnabled || record.isEnabled) ? record : null;
  });
  mocks.user.mockResolvedValue(null); mocks.document.mockResolvedValue({ id: 'doc' });
  mocks.auth.mockResolvedValue({ id: 'reader-' + serial, workspaceId: 'workspace-a', email: 'reader-a@example.test' });
  mocks.fetch.mockImplementation(async (_url: string, options: RequestInit) => {
    const payload = JSON.parse(String(options.body));
    if ((options.headers as Record<string, string>).Authorization !== 'Bearer sk-fixture-personal-a'
      && (options.headers as Record<string, string>).Authorization !== 'Bearer sk-fixture-personal-b') {
      return Response.json({ error: { message: 'Synthetic shared credential failure' } }, { status: 401 });
    }
    const prompt = payload.messages[0].content;
    const content = prompt.includes('test assistant') ? 'Connection successful'
      : prompt.includes('natural reading sense groups') ? JSON.stringify({ groups: [{ text: 'The car' }, { text: 'slows beside me.', verbs: ['slows'] }] })
      : prompt.includes('Replace only targetWord') ? JSON.stringify({ replacement: '减速' })
      : JSON.stringify({ answer: '这里指汽车减慢速度。', citations: [{ quote: text }] });
    if (!payload.stream) return Response.json({ model: payload.model, choices: [{ message: { content } }] });
    return new Response('data: ' + JSON.stringify({ choices: [{ delta: { content } }] }) + '\n\ndata: [DONE]\n\n', {
      headers: { 'Content-Type': 'text/event-stream' },
    });
  });
  vi.stubGlobal('fetch', mocks.fetch);
});
afterEach(() => vi.unstubAllGlobals());

async function shared(provider: 'deepseek' | 'mimo' = 'deepseek') {
  await appConfigService.updateConfig({ allowUserAiSettings: true, shareGlobalDeepSeekWithUsers: true, globalAiProvider: provider,
    ...(provider === 'deepseek' ? { globalDeepseekApiKey: 'sk-fixture-shared-unavailable' } : {}),
  });
}
function expectPersonalCalls(key = 'sk-fixture-personal-a') {
  for (const [url, options] of mocks.fetch.mock.calls) {
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    expect(options.headers.Authorization).toBe('Bearer ' + key);
    expect(JSON.parse(options.body).model).toBe('deepseek-v4-flash');
  }
}

it('a successful personal connection test and actual word explanation use the same personal provider even when global sharing is enabled', async () => {
  await shared();
  const tested = await testSaved(request('settings/ai/test', {}));
  expect(tested.status).toBe(200); expect(await tested.json()).toMatchObject({ success: true });
  const response = await reading(request('reading-assistant', wordBody));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ answer: '这里指汽车减慢速度。', provider: 'deepseek' });
  expect(mocks.fetch).toHaveBeenCalledTimes(2); expectPersonalCalls();
});

it('personal DeepSeek remains usable when the selected shared MiMo has no credentials', async () => {
  await shared('mimo');
  const config = await aiConfigResolver.resolve('workspace-a', 'reader-a@example.test');
  expect(config.providerKey).toBe('deepseek');
  expect((await config.provider.complete({ systemPrompt: 'Explain', userPrompt: text })).content).toContain('汽车');
  expectPersonalCalls();
});

it('does not override a personal configuration with the shared administrator workspace fallback', async () => {
  await appConfigService.updateConfig({ allowUserAiSettings: true, shareGlobalDeepSeekWithUsers: true });
  records.set('admin-workspace', { ...personalA, encryptedApiKey: 'encrypted:sk-fixture-admin-unavailable' });
  mocks.user.mockResolvedValue({ workspaceMembers: [{ workspaceId: 'admin-workspace' }] });
  const response = await reading(request('reading-assistant', wordBody));
  expect(response.status).toBe(200); expectPersonalCalls();
});

it.each(['word', 'meaning', 'flip'] as const)('uses the personal configuration for the real %s streaming route', async (mode) => {
  await shared('mimo');
  const response = mode === 'word' ? await reading(request('reading-assistant', wordBody, true))
    : mode === 'meaning' ? await meaningGroups(request('meaning-groups', { documentId: 'doc', text }, true))
    : await semanticFlip(request('semantic-flip', {
      documentId: 'doc', sourceLanguage: 'en', targetLanguage: 'zh', sourceText: text,
      start: 8, end: 13, targetWord: 'slows', occurrence: 'word-1',
    }, true));
  expect(response.status).toBe(200);
  const value = await consumeAIStream(response, new AbortController().signal, () => {});
  if (mode === 'word') expect(value).toMatchObject({ answer: '这里指汽车减慢速度。' });
  else if (mode === 'meaning') expect(value).toMatchObject({ text });
  else expect(value).toMatchObject({ replacement: '减速', provider: 'deepseek' });
  expect(mocks.fetch).toHaveBeenCalledTimes(1); expectPersonalCalls();
});

it('keeps two readers personal credentials and cache identities separate', async () => {
  await shared('mimo');
  records.set('workspace-b', { ...personalA, id: 'settings-b', encryptedApiKey: 'encrypted:sk-fixture-personal-b' });
  const a = await aiConfigResolver.resolve('workspace-a', 'reader-a@example.test');
  const b = await aiConfigResolver.resolve('workspace-b', 'reader-b@example.test');
  expect(a.settingsHash).not.toBe(b.settingsHash);
  await a.provider.complete({ systemPrompt: 'Explain', userPrompt: text });
  await b.provider.complete({ systemPrompt: 'Explain', userPrompt: text });
  expect(mocks.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer sk-fixture-personal-a');
  expect(mocks.fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer sk-fixture-personal-b');
});

it.each(['disallowed', 'disabled', 'missing'] as const)('fails closed for a %s personal configuration without usable shared credentials', async (state) => {
  await shared('mimo');
  if (state === 'disallowed') await appConfigService.updateConfig({ allowUserAiSettings: false });
  if (state === 'disabled') records.set('workspace-a', { ...personalA, isEnabled: false });
  if (state === 'missing') records.delete('workspace-a');
  await expect(aiConfigResolver.resolve('workspace-a', 'reader-a@example.test')).rejects.toThrow('Global AI API key is not configured');
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it('permits an authorized personal provider without granting access to a disabled shared provider', async () => {
  await shared('mimo'); await appConfigService.updateConfig({ shareGlobalDeepSeekWithUsers: false });
  const response = await reading(request('reading-assistant', wordBody));
  expect(response.status).toBe(200); expectPersonalCalls();
  records.delete('workspace-a');
  await expect(aiConfigResolver.resolve('workspace-a', 'reader-a@example.test')).rejects.toThrow('No AI provider configured');
});
