'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatFileSize } from '@/lib/utils';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { FileText, Clock, RefreshCw, AlertTriangle, Trash2 } from 'lucide-react';
import { DocumentDTO } from '@/types/documents';

type DocumentListItem = Omit<DocumentDTO, 'createdAt' | 'updatedAt'> & {
  createdAt: string | Date;
  updatedAt: string | Date;
  readingProgress?: { location: string; percentage: number; updatedAt: string | Date }[];
};

export default function DocumentList({
  initialDocuments,
}: {
  initialDocuments: DocumentListItem[];
}) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('recent');
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string[]>([]);
  const visible = [...documents].filter(d => d.title.toLowerCase().includes(query.toLowerCase())).sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title) : sort === 'upload' ? +new Date(b.createdAt) - +new Date(a.createdAt) : +new Date(b.readingProgress?.[0]?.updatedAt ?? b.createdAt) - +new Date(a.readingProgress?.[0]?.updatedAt ?? a.createdAt));
  const handleRename = async (doc: DocumentListItem) => {
    const title = window.prompt('Book title', doc.title)?.trim();
    if (!title || title === doc.title) return;
    setError('');
    try {
      const response = await fetch('/api/documents/' + doc.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to rename book');
      setDocuments(list => list.map(d => d.id === doc.id ? { ...d, title: payload.title } : d));
    } catch (e) { setError((e as Error).message); }
  };

  const handleDelete = async (documentId: string) => {
    if (deleting.includes(documentId)) return;
    const confirmed = window.confirm(
      '删除这本书及其阅读进度、笔记、生词和 AI 记录？此操作不可撤销。'
    );
    if (!confirmed) {
      return;
    }

    setError('');
    setDeleting(current => [...current, documentId]);
    try {
      const response = await fetch(`/api/documents/${documentId}`, { method: 'DELETE' });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || '删除未完成，请重试。');
      }
      setDocuments(current => current.filter(doc => doc.id !== documentId));
    } catch (failure) {
      // A failed response may have occurred after deletion started (or even
      // finished). Refresh its durable status before offering the next action.
      try {
        const response = await fetch('/api/documents');
        if (response.ok) {
          const refreshed: DocumentListItem[] = await response.json();
          setDocuments(refreshed);
          if (!refreshed.some(doc => doc.id === documentId)) return;
        }
      } catch { /* Keep the existing row so the user can retry after reconnecting. */ }
      setError(failure instanceof Error ? failure.message : '删除未完成，请重试。');
    } finally {
      setDeleting(current => current.filter(id => id !== documentId));
    }
  };

  if (documents.length === 0) {
    return (
      <div className="relative z-10 rounded-[2rem] border-2 border-dashed border-orange-200 bg-white/60 py-20 text-center shadow-inner shadow-orange-100">
        <div className="mx-auto mb-4 text-5xl">🐱📄</div>
        <FileText className="mx-auto mb-4 h-12 w-12 text-orange-400 opacity-70" />
        <h3 className="text-lg font-bold text-orange-950">No documents found</h3>
        <p className="mb-6 mt-2 text-orange-900/60">Upload a PDF or EPUB to get started.</p>
        <Link href="/upload" className="inline-flex h-10 items-center justify-center rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-orange-200 hover:bg-orange-600">
          Upload Document
        </Link>
      </div>
    );
  }

  return (
    <div className="relative z-10 space-y-5">
      <div className="flex flex-wrap gap-3"><input aria-label="Search books" placeholder="Search your books…" value={query} onChange={e => setQuery(e.target.value)} className="flex-1 rounded-xl border border-orange-200 bg-white p-3" /><select aria-label="Sort books" value={sort} onChange={e => setSort(e.target.value)} className="rounded-xl border border-orange-200 bg-white p-3"><option value="recent">Recently read</option><option value="upload">Recently uploaded</option><option value="title">Title</option></select><Link href="/study" className="rounded-xl bg-orange-100 p-3">Notes & vocabulary</Link></div>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {!visible.length && <p>No books match your search.</p>}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {visible.map((doc) => (
        <DocumentCard key={doc.id} doc={doc} deleting={deleting.includes(doc.id)} onDelete={handleDelete} onRename={handleRename} />
      ))}
      </div>
    </div>
  );
}

function DocumentCard({
  doc,
  onDelete,
  onRename,
  deleting,
}: {
  doc: DocumentListItem;
  onDelete: (documentId: string) => Promise<void>;
  onRename: (doc: DocumentListItem) => Promise<void>;
  deleting: boolean;
}) {
  const deletionPending = doc.status === 'DELETING';
  const isReady = doc.parseStatus === 'COMPLETED' && !deletionPending && !deleting;
  const isProcessing = doc.parseStatus === 'PROCESSING' || doc.parseStatus === 'PENDING';

  return (
    <Card className="group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-orange-200/60">
      <button
        type="button"
        disabled={deleting}
        className="absolute right-3 top-3 z-20 rounded-full border border-orange-200 bg-white/80 p-2 text-orange-700 shadow-sm backdrop-blur-md transition-colors hover:text-red-600"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void onDelete(doc.id);
        }}
        aria-label={`${deletionPending ? '重试删除' : 'Delete'} ${doc.title}`}
      >
        <Trash2 className="h-4 w-4" />
      </button>

      <button disabled={deletionPending || deleting} onClick={() => void onRename(doc)} className="absolute left-3 top-3 z-20 rounded-full bg-white/90 px-3 py-2 text-sm text-orange-800 disabled:opacity-40">Rename</button>
      {!isReady && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-orange-50/70 backdrop-blur-[2px]">
            {deletionPending || deleting ? (
                <p role="status" className="rounded-xl border border-orange-200 bg-white px-4 py-3 text-center text-sm text-orange-900">
                  {deleting ? '正在删除…' : '删除未完成，请点击右上角重试删除。'}
                </p>
            ) : isProcessing ? (
                <div className="flex flex-col items-center text-orange-600">
                    <RefreshCw className="w-8 h-8 animate-spin mb-2" />
                    <span className="rounded-full border border-orange-200 bg-white px-3 py-1 text-sm font-medium shadow-sm">Parsing content...</span>
                </div>
            ) : (
                <div className="flex flex-col items-center text-destructive">
                    <AlertTriangle className="w-8 h-8 mb-2" />
                    <span className="text-sm font-medium bg-background px-3 py-1 rounded-full border border-destructive shadow-sm">Parse failed</span>
                </div>
            )}
        </div>
      )}
      
      <Link aria-disabled={!isReady} tabIndex={isReady ? undefined : -1} href={isReady ? `/reader/${doc.id}${doc.readingProgress?.[0]?.location ? `?location=${encodeURIComponent(doc.readingProgress[0].location)}` : ''}` : '#'} className={!isReady ? 'pointer-events-none opacity-50' : ''}>
        <div className="flex h-36 items-center justify-center border-b border-orange-200 bg-gradient-to-br from-orange-100 via-amber-50 to-white transition-colors group-hover:from-orange-200/80">
          <div className="rounded-full bg-white/70 p-4 text-4xl shadow-inner shadow-orange-100">📖</div>
        </div>
        <CardHeader className="pt-4">
          <CardTitle className="line-clamp-2 text-lg text-orange-950 transition-colors group-hover:text-orange-600" title={doc.title}>
            {doc.title}
          </CardTitle>
          <CardDescription className="mt-2 flex items-center space-x-2 text-orange-900/55">
            <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">{doc.fileType}</span>
            <span>{formatFileSize(doc.fileSize)}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {doc.readingProgress?.[0] && <div className="mb-3 space-y-2"><div className="flex justify-between text-sm text-orange-800"><span>Continue reading</span><span>{Math.round(doc.readingProgress[0].percentage)}%</span></div><progress aria-label="Reading progress" value={doc.readingProgress[0].percentage} max={100} className="h-2 w-full accent-orange-500" /></div>}
          <div className="flex items-center text-xs text-orange-900/50">
            <Clock className="w-3 h-3 mr-1" />
            {new Date(doc.createdAt).toLocaleDateString()}
          </div>
        </CardContent>
      </Link>
    </Card>
  );
}
