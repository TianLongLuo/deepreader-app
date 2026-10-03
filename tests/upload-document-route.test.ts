import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { epubFixture } from './fixtures/epub';
import { book } from './fixtures/pdf';

const mocks = vi.hoisted(() => ({ requireAuth: vi.fn(), uploadDocument: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/server/documents/document.service', () => ({ documentService: { uploadDocument: mocks.uploadDocument } }));
import { POST } from '@/app/api/documents/upload/route';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAuth.mockResolvedValue({ id: 'reader', workspaceId: 'workspace', email: 'fixture@example.test' });
  mocks.uploadDocument.mockImplementation(async (_workspace, _reader, title, fileType) => ({ id: 'saved', title, fileType }));
});
async function upload(bytes: Buffer, name: string, type: string) {
  const form = new FormData();
  form.set('file', new File([new Uint8Array(bytes)], name, { type }));
  return POST(new Request('http://localhost/api/documents/upload', { method: 'POST', body: form }));
}

describe('real EPUB container import', () => {
  it.each([
    ['book.epub', ''],
    ['BOOK.EPUB ', 'application/octet-stream'],
    ['download', 'application/epub+zip; charset=binary'],
    ['download', 'application/x-epub+zip'],
    ['download', 'application/octet-stream'],
    ['download.zip', 'application/x-zip-compressed'],
    ['download.zip', 'application/zip'],
    ['download', ''],
    ['book.epub', 'application/pdf'],
  ])('validates and imports an EPUB despite unreliable metadata: %s (%s)', async (name, type) => {
    const bytes = await epubFixture();
    const response = await upload(bytes, name, type);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, document: { id: 'saved', title: name, fileType: 'EPUB' } });
    expect(mocks.uploadDocument).toHaveBeenCalledWith('workspace', 'reader', name, 'EPUB', bytes, 'application/epub+zip');
  });

  it('accepts a valid single-manifest-item EPUB', async () => {
    const response = await upload(await epubFixture(true), 'single.epub', 'application/epub+zip');
    expect(response.status).toBe(200);
    expect((await response.json()).document.fileType).toBe('EPUB');
  });

  it.each([['book.zip', 'application/zip'], ['book.epub', 'application/epub+zip'], ['download', 'application/octet-stream']])('rejects non-book ZIP archives even with candidate metadata: %s', async (name, type) => {
    const zip = new JSZip();
    zip.file('not-a-book.txt', 'This is not an EPUB.');
    const response = await upload(await zip.generateAsync({ type: 'nodebuffer' }), name, type);
    expect(response.status).toBe(415);
    expect(mocks.uploadDocument).not.toHaveBeenCalled();
  });

  it('rejects an EPUB with no readable spine before saving any document', async () => {
    const zip = await JSZip.loadAsync(await epubFixture());
    zip.remove('OEBPS/chapter.xhtml');
    const response = await upload(await zip.generateAsync({ type: 'nodebuffer' }), 'broken.epub', 'application/epub+zip');
    expect(response.status).toBe(415);
    expect(mocks.uploadDocument).not.toHaveBeenCalled();
  });

  it('does not treat arbitrary octet-stream files as EPUBs', async () => {
    expect((await upload(Buffer.from('not a book'), 'download', 'application/octet-stream')).status).toBe(415);
    expect(mocks.uploadDocument).not.toHaveBeenCalled();
  });

  it('preserves authentication and same-origin checks', async () => {
    mocks.requireAuth.mockRejectedValueOnce(new Error('Authentication required'));
    expect((await upload(await epubFixture(), 'book.epub', 'application/epub+zip')).status).toBe(401);
    const form = new FormData();
    form.set('file', new File([new Uint8Array(await epubFixture())], 'book.epub'));
    const response = await POST(new Request('http://localhost/api/documents/upload', { method: 'POST', headers: { origin: 'https://foreign.example', host: 'localhost' }, body: form }));
    expect(response.status).toBe(403);
    expect(mocks.uploadDocument).not.toHaveBeenCalled();
  });
});

it('imports a real PDF with generic metadata and stores its canonical MIME', async () => {
  const response = await upload(book(['BT /F1 12 Tf 50 700 Td (Fixture.) Tj ET']), 'download', 'application/octet-stream');
  expect(response.status).toBe(200);
  expect((await response.json()).document.fileType).toBe('PDF');
  expect(mocks.uploadDocument.mock.calls[0][5]).toBe('application/pdf');
});
