import { requireAuth } from '@/lib/auth';
import { documentService } from '@/server/documents/document.service';
import { notFound } from 'next/navigation';
import ReaderWrapper from '@/components/reader/reader-wrapper';

export default async function ReaderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  const resolvedParams = await params;
  
  const doc = await documentService.getDocument(resolvedParams.id, user.workspaceId!);
  if (!doc) notFound();

  const sections = await documentService.getSections(resolvedParams.id);
  
  return (
    <ReaderWrapper
      document={doc}
      initialSections={sections}
      currentUser={{
        id: user.id,
        email: user.email,
      }}
    />
  );
}
