import Link from 'next/link';
import { requireAuth } from '@/lib/auth';
import { documentService } from '@/server/documents/document.service';
import DocumentList from '@/components/documents/document-list';

export default async function DocumentsPage() {
  const user = await requireAuth();
  const documents = await documentService.listDocuments(user.workspaceId!, user.id);

  return <div className="page-shell max-w-6xl space-y-8"><header className="flex items-end justify-between gap-4"><div><p className="mb-3 text-xs font-medium tracking-widest text-muted-foreground">DEEPREADER</p><h1 className="text-3xl font-semibold tracking-tight">书库</h1><p className="mt-2 text-sm text-muted-foreground">在原文中理解，让每一次阅读有所收获。</p></div><Link href="/upload" className="inline-flex shrink-0 items-center rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">导入书籍</Link></header><DocumentList initialDocuments={documents}/></div>;
}
