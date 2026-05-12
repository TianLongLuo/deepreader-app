'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UploadCloud, FileText } from 'lucide-react';
import {
  MAX_DOCUMENT_UPLOAD_BYTES,
  MAX_DOCUMENT_UPLOAD_MB,
} from '@/lib/upload-config';

export default function UploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    validateAndSetFile(droppedFile);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) validateAndSetFile(selectedFile);
  };

  const validateAndSetFile = (f: File) => {
    setError('');
    const validTypes = ['application/pdf', 'application/epub+zip'];
    const validExts = ['.pdf', '.epub'];
    
    if (!validTypes.includes(f.type) && !validExts.some(ext => f.name.toLowerCase().endsWith(ext))) {
      setError('Only PDF and EPUB files are supported.');
      return;
    }
    
    if (f.size > MAX_DOCUMENT_UPLOAD_BYTES) {
      setError(`File too large. Maximum size is ${MAX_DOCUMENT_UPLOAD_MB}MB.`);
      return;
    }
    
    setFile(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      router.push('/documents');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  };

  return (
    <div className="cat-page-shell mx-auto flex min-h-[calc(100vh-4rem)] max-w-4xl items-center justify-center">
      <Card className="relative z-10 w-full max-w-2xl p-4 md:p-8">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-gradient-to-br from-orange-200 via-amber-100 to-rose-100 text-5xl shadow-lg shadow-orange-100">🐱</div>
          <CardTitle className="text-4xl font-black text-orange-950">Upload Document</CardTitle>
          <CardDescription className="text-orange-900/65">
            Drop a PDF or EPUB into the kitten basket. Files up to{' '}
            {MAX_DOCUMENT_UPLOAD_MB}MB are supported.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div 
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className={`rounded-[2rem] border-2 border-dashed p-12 text-center transition-all ${
              file ? 'border-orange-400 bg-orange-100/70 shadow-inner shadow-orange-200' : 'border-orange-200 bg-orange-50/50 hover:border-orange-400 hover:bg-orange-100/50'
            }`}
          >
            {file ? (
              <div className="flex flex-col items-center space-y-4">
                <div className="rounded-full bg-orange-200 p-4">
                  <FileText className="h-12 w-12 text-orange-700" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-orange-950">{file.name}</h3>
                  <p className="text-sm text-orange-900/55">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setFile(null)}>Remove</Button>
              </div>
            ) : (
              <div className="flex flex-col items-center space-y-4">
                <div className="rounded-full bg-orange-100 p-4 text-4xl shadow-inner shadow-orange-200">
                  <UploadCloud className="h-10 w-10 text-orange-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-orange-950">Drag & drop your file here</h3>
                  <p className="mt-1 text-sm text-orange-900/55">or click to browse — meow</p>
                </div>
                <input 
                  type="file" 
                  id="file-upload" 
                  className="hidden" 
                  accept=".pdf,.epub,application/pdf,application/epub+zip"
                  onChange={handleFileChange}
                />
                <Button variant="secondary" onClick={() => document.getElementById('file-upload')?.click()}>
                  Browse Files
                </Button>
              </div>
            )}
          </div>
          
          {error && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-600">
              {error}
            </div>
          )}

          <div className="mt-8 flex justify-end">
            <Button size="lg" disabled={!file || loading} onClick={handleUpload}>
              {loading ? 'Kitten is parsing...' : 'Upload and Parse'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
