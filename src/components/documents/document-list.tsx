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
};

export default function DocumentList({
  initialDocuments,
}: {
  initialDocuments: DocumentListItem[];
}) {
  const [documents, setDocuments] = useState(initialDocuments);

  const handleDelete = async (documentId: string) => {
    const confirmed = window.confirm(
      'Delete this book and all paragraph explanations bound to it?'
    );
    if (!confirmed) {
      return;
    }

    const response = await fetch(`/api/documents/${documentId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      window.alert(payload?.error || 'Failed to delete document.');
      return;
    }

    setDocuments((current) => current.filter((doc) => doc.id !== documentId));
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
    <div className="relative z-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {documents.map((doc) => (
        <DocumentCard key={doc.id} doc={doc} onDelete={handleDelete} />
      ))}
    </div>
  );
}

function DocumentCard({
  doc,
  onDelete,
}: {
  doc: DocumentListItem;
  onDelete: (documentId: string) => Promise<void>;
}) {
  const isReady = doc.parseStatus === 'COMPLETED';
  const isProcessing = doc.parseStatus === 'PROCESSING' || doc.parseStatus === 'PENDING';

  return (
    <Card className="group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-orange-200/60">
      <button
        type="button"
        className="absolute right-3 top-3 z-20 rounded-full border border-orange-200 bg-white/80 p-2 text-orange-700 shadow-sm backdrop-blur-md transition-colors hover:text-red-600"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void onDelete(doc.id);
        }}
        aria-label={`Delete ${doc.title}`}
      >
        <Trash2 className="h-4 w-4" />
      </button>

      {!isReady && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-orange-50/70 backdrop-blur-[2px]">
            {isProcessing ? (
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
      
      <Link href={isReady ? `/reader/${doc.id}` : '#'} className={!isReady ? 'pointer-events-none opacity-50' : ''}>
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
          <div className="flex items-center text-xs text-orange-900/50">
            <Clock className="w-3 h-3 mr-1" />
            {new Date(doc.createdAt).toLocaleDateString()}
          </div>
        </CardContent>
      </Link>
    </Card>
  );
}
