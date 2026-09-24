import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), getDocument: vi.fn(), download: vi.fn(), renderPage: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireAuth: mocks.auth }));
vi.mock('@/server/documents/document.service', () => ({ documentService: { getDocument: mocks.getDocument } }));
vi.mock('@/server/storage', () => ({ getStorageProvider: () => ({ download: mocks.download }) }));
vi.mock('@/server/parsing/pdf.parser', () => ({ pdfParser: { renderPage: mocks.renderPage } }));

import { GET } from '../src/app/api/documents/[id]/pages/[page]/route';

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const pdf = Buffer.from('%PDF-mock');
const rendered = { data: png, pageCount: 7 };

function request(page = '1') {
  return GET(new Request(`http://localhost/api/documents/doc/pages/${encodeURIComponent(page)}`), {
    params: Promise.resolve({ id: 'doc', page }),
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ id: 'user', workspaceId: 'workspace' });
  mocks.getDocument.mockResolvedValue({ fileType: 'PDF', storageKey: 'document.pdf' });
  mocks.download.mockResolvedValue(pdf);
  mocks.renderPage.mockResolvedValue(rendered);
});

describe('PDF page image route', () => {
  it('returns PNG bytes with private caching and the physical page count', async () => {
    const response = await request('3');
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(png);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('content-length')).toBe(String(png.length));
    expect(response.headers.get('cache-control')).toBe('private, max-age=300');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-pdf-page-count')).toBe('7');
    expect(mocks.getDocument).toHaveBeenCalledWith('doc', 'workspace');
    expect(mocks.download).toHaveBeenCalledWith('document.pdf');
    expect(mocks.renderPage).toHaveBeenCalledWith(pdf, 3);
  });

  it('does not download or render a document outside the authenticated workspace', async () => {
    mocks.getDocument.mockResolvedValue(null);
    expect((await request()).status).toBe(404);
    expect(mocks.getDocument).toHaveBeenCalledWith('doc', 'workspace');
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.renderPage).not.toHaveBeenCalled();
  });

  it('does not query or read document data when authentication fails', async () => {
    mocks.auth.mockRejectedValue(new Error('Authentication required'));
    expect((await request()).ok).toBe(false);
    expect(mocks.getDocument).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.renderPage).not.toHaveBeenCalled();
  });

  it('rejects EPUB input before downloading it', async () => {
    mocks.getDocument.mockResolvedValue({ fileType: 'EPUB', storageKey: 'book.epub' });
    expect((await request()).status).toBe(400);
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.renderPage).not.toHaveBeenCalled();
  });

  it.each(['0', '-1', '1.5', 'abc', '', '1e2', 'Infinity', '9007199254740992', ' 1'])('rejects invalid page %j', async (page) => {
    expect((await request(page)).status).toBe(400);
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.renderPage).not.toHaveBeenCalled();
  });

  it('returns 404 for a page absent from the physical PDF', async () => {
    mocks.renderPage.mockRejectedValue(new RangeError('Page out of range'));
    expect((await request('8')).status).toBe(404);
  });

  it('returns 500 for a rendering failure without exposing internal details', async () => {
    mocks.renderPage.mockRejectedValue(new Error('private filesystem /server/secret'));
    const response = await request();
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('/server/secret');
  });

  it.each(['resolve', 'reject'] as const)('limits concurrency to two and releases capacity when a render %ss', async (outcome) => {
    const first = deferred<typeof rendered>();
    const second = deferred<typeof rendered>();
    mocks.renderPage.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
    const pending = [request('1'), request('2')];
    try {
      await vi.waitFor(() => expect(mocks.renderPage).toHaveBeenCalledTimes(2));
      const busy = await request('3');
      expect(busy.status).toBe(503);
      expect(busy.headers.get('retry-after')).toBe('1');
      expect(mocks.download).toHaveBeenCalledTimes(2);
      expect(mocks.renderPage).toHaveBeenCalledTimes(2);

      if (outcome === 'resolve') first.resolve(rendered);
      else first.reject(new Error('Canvas failed'));
      expect((await pending[0]).status).toBe(outcome === 'resolve' ? 200 : 500);
      expect((await request('3')).status).toBe(200);
      expect(mocks.renderPage).toHaveBeenCalledTimes(3);
    } finally {
      first.resolve(rendered);
      second.resolve(rendered);
      await Promise.all(pending);
    }
    expect((await request('4')).status).toBe(200);
  });

  it('releases capacity after storage download failures', async () => {
    mocks.download.mockRejectedValueOnce(new Error('Storage unavailable')).mockRejectedValueOnce(new Error('Storage unavailable'));
    expect((await request()).status).toBe(500);
    expect((await request()).status).toBe(500);
    expect((await request()).status).toBe(200);
  });
});
