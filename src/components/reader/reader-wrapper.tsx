'use client';

import dynamic from 'next/dynamic';

const ReaderLayoutNoSSR = dynamic(() => import('./reader-layout'), {
  ssr: false,
  loading: () => <div className="flex h-screen items-center justify-center bg-orange-50 text-orange-900/60 animate-pulse">🐱 Initializing cozy reader engine...</div>
});

export default function ReaderWrapper({
  document,
  initialSections,
  currentUser,
}: {
  document: {
    id: string;
    title: string;
    fileType: string;
  };
  initialSections?: unknown[];
  currentUser: {
    id: string;
    email: string;
  };
}) {
  return (
    <ReaderLayoutNoSSR
      document={document}
      initialSections={initialSections}
      currentUser={currentUser}
    />
  );
}
