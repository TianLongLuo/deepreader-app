import { requireAuth } from '@/lib/auth';
import StudyLibrary from '@/components/study/study-library';
export default async function StudyPage() {
  await requireAuth();
  return <StudyLibrary />;
}
