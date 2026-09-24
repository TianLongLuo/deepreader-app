import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

vi.mock('@/lib/prisma', async () => {
  const { PrismaClient } = await import('@prisma/client');
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'deepreader-access-'));
  return { prisma: new PrismaClient({ datasourceUrl: `file:${join(dir, 'test.db').replaceAll('\\', '/')}` }), dir };
});
vi.mock('@/lib/redis', () => ({ cacheService: {} }));
vi.mock('@/server/ai/config-resolver', () => ({ aiConfigResolver: { resolve: vi.fn() } }));
vi.mock('@/lib/logger', () => ({ createChildLogger: () => ({ info: vi.fn(), error: vi.fn() }) }));

import { prisma } from '@/lib/prisma';
import { documentService } from '@/server/documents/document.service';
import { aiExplanationService } from '@/server/ai/explanation.service';
import { aiConfigResolver } from '@/server/ai/config-resolver';

let schemaDir: string;
beforeAll(async () => {
  const mocked = await import('@/lib/prisma') as typeof import('@/lib/prisma') & { dir: string };
  schemaDir = mkdtempSync(join(tmpdir(), 'deepreader-schema-'));
  const schema = readFileSync('prisma/schema.prisma', 'utf8').replace('file:./dev.db', `file:${join(mocked.dir, 'test.db').replaceAll('\\', '/')}`);
  const schemaPath = join(schemaDir, 'schema.prisma');
  writeFileSync(schemaPath, schema);
  writeFileSync(join(mocked.dir, 'test.db'), '');
  execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'db', 'push', '--schema', schemaPath, '--skip-generate'], { stdio: 'pipe' });
  await prisma.user.create({ data: { id: 'user', email: 'test@example.com', passwordHash: 'unused' } });
  await prisma.workspace.createMany({ data: [{ id: 'owner', name: 'Owner' }, { id: 'other', name: 'Other' }] });
  await prisma.document.create({ data: { id: 'doc', workspaceId: 'owner', userId: 'user', title: 'Private', fileType: 'PDF', storageKey: 'unused', fileSize: 1 } });
  await prisma.documentSection.create({ data: { id: 'section', documentId: 'doc', title: 'Private', orderIndex: 0, anchor: 'one' } });
  await prisma.paragraph.create({ data: { id: 'paragraph', sectionId: 'section', documentId: 'doc', orderIndex: 0, rawText: 'Private text.', normalizedText: 'Private text.', textHash: 'hash', startOffset: 0, endOffset: 13 } });
  await prisma.paragraphExplanation.create({ data: { paragraphId: 'paragraph', provider: 'test', model: 'test', promptVersion: '1', settingsHash: 'hash', outputJson: '{}', status: 'COMPLETED' } });
}, 60_000);

afterAll(async () => {
  await prisma.$disconnect();
  const mocked = await import('@/lib/prisma') as typeof import('@/lib/prisma') & { dir: string };
  rmSync(mocked.dir, { recursive: true, force: true });
  if (schemaDir) rmSync(schemaDir, { recursive: true, force: true });
});

it('allows the owner to read paragraphs while isolating other workspaces', async () => {
  expect(await documentService.getParagraphs('section', 'owner')).toHaveLength(1);
  expect(await documentService.getParagraphs('section', 'other')).toEqual([]);
});
it('does not return another workspace’s saved explanation', async () => {
  expect(await aiExplanationService.getExplanation('paragraph', 'other')).toBeNull();
  expect(await aiExplanationService.getExplanation('paragraph', 'owner')).toMatchObject({ paragraphId: 'paragraph' });
});
it('rejects foreign generation before accessing any AI configuration', async () => {
  await expect(aiExplanationService.explain('other', { paragraphId: 'paragraph' })).rejects.toThrow('Paragraph not found');
  await expect(aiExplanationService.streamExplain('other', { paragraphId: 'paragraph' })[Symbol.asyncIterator]().next()).rejects.toThrow('Paragraph not found');
  expect(aiConfigResolver.resolve).not.toHaveBeenCalled();
});
