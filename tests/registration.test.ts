import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), getPublicConfig: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: mocks.findUnique } } }));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('@/lib/logger', () => ({ createChildLogger: () => ({ info: vi.fn(), error: vi.fn() }) }));
import { appConfigService } from '@/server/app-config/app-config.service';
import { registerUser } from '@/lib/auth';

it.each(['admin@qq.com', 'ADMIN@qq.com', ' admin@qq.com '])('prevents public registration of privileged identity %s', async email => {
  const config = vi.spyOn(appConfigService, 'getPublicConfig').mockResolvedValue({ allowRegistrations: true });
  await expect(registerUser(email, 'example-password')).rejects.toThrow('reserved');
  expect(mocks.findUnique).not.toHaveBeenCalled();
  config.mockRestore();
});
