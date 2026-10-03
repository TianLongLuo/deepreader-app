// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import AISettingsForm from '@/components/settings/ai-settings-form';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });
const input = (name: string) => document.querySelector<HTMLInputElement>('input[name="' + name + '"]')!;

it('does not load another account legacy AI draft and removes only that unscoped AI draft', () => {
  localStorage.setItem('draft:ai_settings_draft', JSON.stringify({ apiKey: 'sk-fixture-other-reader', model: 'other-model', baseUrl: 'https://other.example.test' }));
  localStorage.setItem('draft:unrelated_notes', 'keep');
  render(createElement(AISettingsForm, { userId: 'reader-a', initialData: { model: 'own-model', baseUrl: 'https://api.deepseek.com' } }));
  expect(input('apiKey').value).toBe('');
  expect(input('model').value).toBe('own-model');
  expect(input('baseUrl').value).toBe('https://api.deepseek.com');
  expect(localStorage.getItem('draft:ai_settings_draft')).toBeNull();
  expect(localStorage.getItem('draft:unrelated_notes')).toBe('keep');
});

it('keeps an unsaved API key only in memory while retaining non-secret settings under the current account', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({ success: true, message: 'Connected', latencyMs: 17 }));
  vi.stubGlobal('fetch', fetcher);
  render(createElement(AISettingsForm, { userId: 'reader-a', initialData: {} }));
  fireEvent.change(input('apiKey'), { target: { value: 'sk-fixture-memory-only' } });
  fireEvent.change(input('model'), { target: { value: 'personal-model' } });
  expect(input('apiKey').value).toBe('sk-fixture-memory-only');
  expect(localStorage.getItem('draft:ai_settings_draft:reader-a')).not.toBeNull();
  const stored = JSON.parse(localStorage.getItem('draft:ai_settings_draft:reader-a')!);
  expect(stored.model).toBe('personal-model'); expect(stored.apiKey).toBe('');
  expect(JSON.stringify({ ...localStorage })).not.toContain('sk-fixture-memory-only');
  fireEvent.click(screen.getByRole('button', { name: '测试连接' }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  expect(JSON.parse(String(fetcher.mock.calls[0][1]!.body)).apiKey).toBe('sk-fixture-memory-only');
  await waitFor(() => expect(screen.getByText(/17ms/)).toBeTruthy());
  expect(screen.getByText(/测试只验证连接.*保存设置/)).toBeTruthy();
});

it('keeps readers drafts isolated, including when the account changes in a mounted form', () => {
  const a = render(createElement(AISettingsForm, { userId: 'reader-a', initialData: {} }));
  fireEvent.change(input('model'), { target: { value: 'reader-a-model' } });
  fireEvent.change(input('apiKey'), { target: { value: 'sk-fixture-reader-a' } });
  a.rerender(createElement(AISettingsForm, { userId: 'reader-b', initialData: { model: 'reader-b-model' } }));
  expect(input('model').value).toBe('reader-b-model'); expect(input('apiKey').value).toBe('');
  expect(JSON.parse(localStorage.getItem('draft:ai_settings_draft:reader-a')!).model).toBe('reader-a-model');
  a.unmount();
  render(createElement(AISettingsForm, { userId: 'reader-a', initialData: {} }));
  expect(input('model').value).toBe('reader-a-model'); expect(input('apiKey').value).toBe('');
});

it('clears accidentally persisted API secrets when reading the current accounts draft', () => {
  localStorage.setItem('draft:ai_settings_draft:reader-a', JSON.stringify({ apiKey: 'sk-fixture-stale', model: 'reader-a-model' }));
  render(createElement(AISettingsForm, { userId: 'reader-a', initialData: {} }));
  expect(input('model').value).toBe('reader-a-model'); expect(input('apiKey').value).toBe('');
  expect(localStorage.getItem('draft:ai_settings_draft:reader-a')).not.toContain('sk-fixture-stale');
});

it('still permits entering and testing an in-memory key when browser draft storage is blocked', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError'); });
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError'); });
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({ success: true, message: 'Connected', latencyMs: 17 }));
  vi.stubGlobal('fetch', fetcher);
  render(createElement(AISettingsForm, { userId: 'reader-a', initialData: {} }));
  fireEvent.change(input('apiKey'), { target: { value: 'sk-fixture-memory-only' } });
  fireEvent.click(screen.getByRole('button', { name: '测试连接' }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  expect(JSON.parse(String(fetcher.mock.calls[0][1]!.body)).apiKey).toBe('sk-fixture-memory-only');
});
