import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(), uploadDocument: vi.fn(), getDocument: vi.fn(),
  explain: vi.fn(), streamExplain: vi.fn(), parse: vi.fn(), download: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/server/documents/document.service', () => ({ documentService: mocks }));
vi.mock('@/server/ai/explanation.service', () => ({ aiExplanationService: mocks }));
vi.mock('@/server/parsing/pdf.parser', () => ({ pdfParser: mocks }));
vi.mock('@/server/storage', () => ({ getStorageProvider: () => mocks }));

import { POST as explain } from '@/app/api/paragraphs/[id]/explain/route';
import { GET as pdfText } from '@/app/api/documents/[id]/text/route';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAuth.mockResolvedValue({ id: 'user', workspaceId: 'workspace', email: 'reader@example.com' });
});

describe('paragraph request identity', () => {
  it.each([false, true])('uses the URL paragraph even when the body supplies another (stream=%s)', async (stream) => {
    mocks.explain.mockResolvedValue({ id: 'result' });
    mocks.streamExplain.mockImplementation(async function* () { yield { type: 'done' }; });
    const response = await explain(new Request('http://localhost/api/paragraphs/owned/explain', {
      method: 'POST', body: JSON.stringify({ paragraphId: 'foreign', stream }),
    }), { params: Promise.resolve({ id: 'owned' }) });
    await response.text();
    expect(stream ? mocks.streamExplain : mocks.explain).toHaveBeenCalledWith(
      'workspace', expect.objectContaining({ paragraphId: 'owned' }), 'reader@example.com',
    );
  });
});

describe('upload validation', () => {
  it('rejects a text form field instead of throwing a 500', async () => {
    const { POST } = await import('@/app/api/documents/upload/route');
    const form = new FormData();
    form.set('file', 'not a file');
    const response = await POST(new Request('http://localhost/upload', { method: 'POST', body: form }));
    expect(response.status).toBe(400);
    expect(mocks.uploadDocument).not.toHaveBeenCalled();
  });
  it('accepts a valid file', async () => {
    const { POST } = await import('@/app/api/documents/upload/route');
    const form = new FormData();
    form.set('file', new File(['%PDF sample'], 'sample.pdf', { type: 'application/pdf' }));
    mocks.uploadDocument.mockResolvedValue({ id: 'document' });
    const response = await POST(new Request('http://localhost/upload', { method: 'POST', body: form }));
    expect(response.status).toBe(200);
    expect(mocks.uploadDocument).toHaveBeenCalledOnce();
  });
});

it('returns short PDF headings and dialogue to the reader', async () => {
  mocks.getDocument.mockResolvedValue({ id: 'pdf', fileType: 'PDF', updatedAt: new Date(0), storageKey: 'test', fileSize: 5 });
  mocks.download.mockResolvedValue(Buffer.from('test'));
  mocks.parse.mockResolvedValue({ title: 'Test', pageCount: 1, sections: [{
    paragraphs: ['Go!', '你好。', 'Chapter 1', '  '].map(rawText => ({ rawText, normalizedText: rawText.trim(), pageNumber: 1 })), children: [],
  }] });
  const response = await pdfText(new Request('http://localhost/pdf'), { params: Promise.resolve({ id: 'pdf' }) });
  const payload = await response.json();
  expect(payload.paragraphs.map((p: { text: string }) => p.text)).toEqual(['Go!', '你好。', 'Chapter 1']);
});
