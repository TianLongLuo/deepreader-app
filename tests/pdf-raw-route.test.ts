import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), getDocument: vi.fn(), download: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireAuth: mocks.auth }));
vi.mock('@/server/documents/document.service', () => ({ documentService: { getDocument: mocks.getDocument } }));
vi.mock('@/server/storage', () => ({ getStorageProvider: () => ({ download: mocks.download }) }));

import { GET } from '../src/app/api/documents/[id]/raw/route';

function request(range?: string) {
  return GET(new Request('http://localhost/api/documents/doc/raw', {
    headers: range ? { Range: range } : {},
  }), { params: Promise.resolve({ id: 'doc' }) });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ id: 'user', workspaceId: 'workspace' });
  mocks.getDocument.mockResolvedValue({ title: '中文书名.pdf', fileType: 'PDF', storageKey: 'document.pdf' });
  mocks.download.mockResolvedValue(Buffer.from('0123456789'));
});

describe('raw PDF responses', () => {
  it('serves Unicode filenames with a safe ASCII fallback and UTF-8 filename', async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toBe(`inline; filename="____.pdf"; filename*=UTF-8''${encodeURIComponent('中文书名.pdf')}`);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-length')).toBe('10');
    expect(await response.text()).toBe('0123456789');
    expect(mocks.getDocument).toHaveBeenCalledWith('doc', 'workspace');
  });

  it('sanitizes quotes, control characters and path separators without header injection', async () => {
    mocks.getDocument.mockResolvedValue({ title: 'a"\r\n/b\\c雪.pdf', fileType: 'PDF', storageKey: 'document.pdf' });
    const response = await request('bytes=0-0');
    expect(response.status).toBe(206);
    const disposition = response.headers.get('content-disposition')!;
    expect(disposition).toContain('filename="a____b_c_.pdf"');
    expect(disposition).toContain("filename*=UTF-8''a%22___b_c%E9%9B%AA.pdf");
    expect(disposition).not.toMatch(/[\r\n]/);
  });

  it.each([
    ['bytes=0-0', '0', 'bytes 0-0/10'],
    ['bytes=2-5', '2345', 'bytes 2-5/10'],
    ['bytes=7-', '789', 'bytes 7-9/10'],
    ['bytes=-3', '789', 'bytes 7-9/10'],
    ['bytes=-30', '0123456789', 'bytes 0-9/10'],
    ['bytes=8-99', '89', 'bytes 8-9/10'],
    ['bytes=8-99999999999999999999999999999999', '89', 'bytes 8-9/10'],
    ['bytes=-99999999999999999999999999999999', '0123456789', 'bytes 0-9/10'],
  ])('returns the inclusive byte interval for %s', async (range, body, contentRange) => {
    const response = await request(range);
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe(contentRange);
    expect(response.headers.get('content-length')).toBe(String(body.length));
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(await response.text()).toBe(body);
  });

  it.each(['bytes=10-', 'bytes=9-2', 'bytes=-0', 'bytes=-', 'bytes=oops', 'bytes=1-2junk', 'bytes=99999999999999999999999999999999-'])('rejects invalid or unsatisfiable interval %s', async (range) => {
    const response = await request(range);
    expect(response.status).toBe(416);
    expect(response.headers.get('content-range')).toBe('bytes */10');
    expect(await response.text()).toBe('');
  });

  it('returns 416 for a byte request against an empty file', async () => {
    mocks.download.mockResolvedValue(Buffer.alloc(0));
    const response = await request('bytes=0-');
    expect(response.status).toBe(416);
    expect(response.headers.get('content-range')).toBe('bytes */0');
  });

  it.each(['bytes=0-1,5-6', 'items=0-1'])('ignores unsupported range %s and serves the full file', async (range) => {
    const response = await request(range);
    expect(response.status).toBe(200);
    expect(response.headers.has('content-range')).toBe(false);
    expect(await response.text()).toBe('0123456789');
  });

  it('does not download documents outside the authenticated workspace', async () => {
    mocks.getDocument.mockResolvedValue(null);
    const response = await request('bytes=0-1');
    expect(response.status).toBe(404);
    expect(mocks.getDocument).toHaveBeenCalledWith('doc', 'workspace');
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('does not query or download a document when authentication fails', async () => {
    mocks.auth.mockRejectedValue(new Error('Authentication required'));
    const response = await request();
    expect(response.ok).toBe(false);
    expect(mocks.getDocument).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('continues to serve EPUB files in full with an encoded filename', async () => {
    mocks.getDocument.mockResolvedValue({ title: '中文.epub', fileType: 'EPUB', storageKey: 'book.epub' });
    const response = await request('bytes=0-1');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/epub+zip');
    expect(response.headers.get('accept-ranges')).toBe('none');
    expect(await response.text()).toBe('0123456789');
  });
});
