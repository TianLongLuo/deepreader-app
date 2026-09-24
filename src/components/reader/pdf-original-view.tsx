'use client';

import { useState } from 'react';

type Props = {
  documentId: string;
  title: string;
  page: number;
  onPageReady: (page: number) => void;
};

export default function PdfOriginalView({ documentId, title, page, onPageReady }: Props) {
  const [zoom, setZoom] = useState<'fit' | 'actual'>('fit');
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b p-3 text-sm">
        <label className="flex items-center gap-2">
          缩放
          <select aria-label="书页缩放" className="rounded-lg border bg-transparent px-3 py-2" value={zoom} onChange={event => setZoom(event.target.value as 'fit' | 'actual')}>
            <option value="fit">适宽</option>
            <option value="actual">100%</option>
          </select>
        </label>
      </div>
      <div key={documentId + ':' + page} className="min-h-0 flex-1 overflow-auto bg-black/10 p-3">
        <PdfPageImage key={documentId + ':' + page} documentId={documentId} title={title} page={page} zoom={zoom} onPageReady={onPageReady} />
      </div>
    </div>
  );
}

function PdfPageImage({ documentId, title, page, zoom, onPageReady }: Props & { zoom: 'fit' | 'actual' }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  if (status === 'error') {
    return (
      <div role="alert" className="rounded-xl border border-orange-200 bg-orange-50 p-6 text-orange-950">
        <p>此页加载失败。可重试或打开原文件查看；不会保存未加载的页码。</p>
        <a className="mt-3 inline-block underline" href={'/api/documents/' + documentId + '/raw#page=' + page} target="_blank" rel="noreferrer">新窗口打开原 PDF</a>
        <button type="button" className="ml-4 rounded-lg border px-3 py-2" onClick={() => setStatus('loading')}>重试</button>
      </div>
    );
  }
  return (
    <>
      {status === 'loading' && <p role="status" className="p-6 text-center text-sm">正在加载第 {page} 页…</p>}
      {/* Authenticated same-origin PNG: native img avoids an unnecessary image optimizer request. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={'/api/documents/' + documentId + '/pages/' + page}
        alt={title + '，第 ' + page + ' 页'}
        onLoad={() => { setStatus('ready'); onPageReady(page); }}
        onError={() => setStatus('error')}
        className={zoom === 'fit' ? 'mx-auto block h-auto w-full max-w-none bg-white shadow-lg' : 'block h-auto w-auto max-w-none bg-white shadow-lg'}
      />
    </>
  );
}
