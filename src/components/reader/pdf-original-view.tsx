'use client';

import { useState } from 'react';

type Props = {
  documentId: string;
  title: string;
  page: number;
  pageCount: number | null;
  onPageChange: (page: number) => void;
};

export default function PdfOriginalView({ documentId, title, page, pageCount, onPageChange }: Props) {
  const [zoom, setZoom] = useState<'fit' | 'actual'>('fit');
  const button = 'rounded-lg border border-orange-200 px-3 py-2 disabled:opacity-40';
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b p-3 text-sm">
        <button type="button" className={button} disabled={page <= 1} onClick={() => onPageChange(page - 1)}>上一页</button>
        <span aria-live="polite">第 {page} 页 / {pageCount ?? '…'} 页</span>
        <button type="button" className={button} disabled={pageCount === null || page >= pageCount} onClick={() => onPageChange(page + 1)}>下一页</button>
        <label className="flex items-center gap-2">
          缩放
          <select aria-label="原版缩放" className="rounded-lg border bg-transparent px-3 py-2" value={zoom} onChange={event => setZoom(event.target.value as 'fit' | 'actual')}>
            <option value="fit">适宽</option>
            <option value="actual">100%</option>
          </select>
        </label>
      </div>
      <div key={documentId + ':' + page} className="min-h-0 flex-1 overflow-auto bg-black/10 p-3">
        <PdfPageImage key={documentId + ':' + page} documentId={documentId} title={title} page={page} zoom={zoom} />
      </div>
    </div>
  );
}

function PdfPageImage({ documentId, title, page, zoom }: Pick<Props, 'documentId' | 'title' | 'page'> & { zoom: 'fit' | 'actual' }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  if (status === 'error') {
    return (
      <div role="alert" className="rounded-xl border border-orange-200 bg-orange-50 p-6 text-orange-950">
        <p>此页原版图像加载失败。请在新窗口打开原 PDF 查看。</p>
        <a className="mt-3 inline-block underline" href={'/api/documents/' + documentId + '/raw#page=' + page} target="_blank" rel="noreferrer">新窗口打开原 PDF</a>
        <button type="button" className="ml-4 rounded-lg border px-3 py-2" onClick={() => setStatus('loading')}>重试</button>
      </div>
    );
  }
  return (
    <>
      {status === 'loading' && <p role="status" className="p-6 text-center text-sm">正在加载第 {page} 页原版…</p>}
      {/* Authenticated same-origin PNG: native img avoids an unnecessary image optimizer request. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={'/api/documents/' + documentId + '/pages/' + page}
        alt={title + '，第 ' + page + ' 页原版'}
        onLoad={() => setStatus('ready')}
        onError={() => setStatus('error')}
        className={zoom === 'fit' ? 'mx-auto block h-auto w-full max-w-none bg-white shadow-lg' : 'block h-auto w-auto max-w-none bg-white shadow-lg'}
      />
    </>
  );
}
