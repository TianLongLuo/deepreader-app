// @vitest-environment jsdom
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import UploadPage from '@/app/(dashboard)/upload/page';
import { MAX_DOCUMENT_UPLOAD_BYTES } from '@/lib/upload-config';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const choose = (file: File) => {
  const input = document.querySelector('input[type="file"]')!;
  fireEvent.change(input, { target: { files: [file] } });
};

it.each([
  ['book.epub', '', 'epub'],
  ['BOOK.EPUB ', '', 'epub'],
  ['book', 'application/epub+zip; charset=binary', 'epub'],
  ['book', 'application/x-epub+zip', 'epub'],
  ['download', 'application/octet-stream', 'zip'],
  ['download.zip', 'application/x-zip-compressed', 'zip'],
  ['download', '', 'zip'],
])('selects EPUB candidates without relying on browser MIME: %s (%s)', async (name, type, bytes) => {
  render(createElement(UploadPage));
  const file = new File([bytes === 'zip' ? new Uint8Array([0x50, 0x4b, 3, 4, 0]) : 'fixture'], name, { type });
  choose(file);
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  await waitFor(() => expect(screen.getByRole('button', { name: '导入书籍' })).toHaveProperty('disabled', false));
  expect(screen.getByRole('heading', { name: name.trim() })).toBeTruthy();
});

it('rejects a generic text file and keeps import disabled', async () => {
  render(createElement(UploadPage));
  choose(new File(['not a book'], 'download', { type: 'application/octet-stream' }));
  await screen.findByRole('alert');
  expect(screen.getByRole('button', { name: '导入书籍' })).toHaveProperty('disabled', true);
});

it('does not retain an earlier valid book after a rejected drop', async () => {
  render(createElement(UploadPage));
  choose(new File(['%PDF'], 'first.pdf', { type: 'application/pdf' }));
  await screen.findByText('first.pdf');
  const dropTarget = screen.getByText('first.pdf').closest('.border-dashed')!;
  fireEvent.drop(dropTarget, { dataTransfer: { files: [new File(['not a book'], 'second.txt', { type: 'text/plain' })] } });
  await screen.findByRole('alert');
  expect(screen.getByRole('button', { name: '导入书籍' })).toHaveProperty('disabled', true);
  expect(screen.queryByText('first.pdf')).toBeNull();
});

it('rejects over-limit candidates before reading their contents', async () => {
  render(createElement(UploadPage));
  const file = new File(['not a book'], 'download', { type: 'application/octet-stream' });
  Object.defineProperty(file, 'size', { value: MAX_DOCUMENT_UPLOAD_BYTES + 1 });
  const read = vi.spyOn(file, 'slice');
  choose(file);
  expect((await screen.findByRole('alert')).textContent).toContain('文件过大');
  expect(read).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: '导入书籍' })).toHaveProperty('disabled', true);
});

it('ignores a delayed signature result after a newer selection', async () => {
  let finish!: () => void;
  class DelayedReader {
    result = new Uint8Array([0x50, 0x4b, 3, 4]).buffer;
    onload?: () => void;
    onerror?: () => void;
    readAsArrayBuffer() { finish = () => this.onload?.(); }
  }
  vi.stubGlobal('FileReader', DelayedReader);
  render(createElement(UploadPage));
  choose(new File(['PK\u0003\u0004'], 'slow-download', { type: 'application/octet-stream' }));
  await waitFor(() => expect(finish).toBeTypeOf('function'));
  choose(new File(['%PDF'], 'latest.pdf', { type: 'application/pdf' }));
  await screen.findByText('latest.pdf');
  await act(async () => { finish(); });
  expect(screen.queryByText('slow-download')).toBeNull();
  expect(screen.getByText('latest.pdf')).toBeTruthy();
});
