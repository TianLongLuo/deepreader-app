import { requireAuth } from '@/lib/auth';
import { documentService } from '@/server/documents/document.service';
import DocumentList from '@/components/documents/document-list';

export default async function DocumentsPage() {
  const user = await requireAuth();
  const documents = await documentService.listDocuments(user.workspaceId!);

  return (
    <div className="cat-page-shell mx-auto max-w-6xl space-y-8 animate-in fade-in duration-500">
      <div className="relative z-10 flex items-end justify-between rounded-[2rem] border border-orange-200/70 bg-white/60 p-6 shadow-xl shadow-orange-200/30 backdrop-blur-xl">
        <div>
          <div className="mb-3 text-4xl">🐱📚</div>
          <h1 className="cat-heading mb-2 text-4xl font-black tracking-tight">My Library</h1>
          <p className="cat-muted cursor-default font-medium">Pick a book, curl up, and begin deep reading.</p>
        </div>
      </div>
      
      <DocumentList initialDocuments={documents} />
    </div>
  );
}
