'use client';

import { useState,useRef,useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UploadCloud, FileText } from 'lucide-react';
import { canInspectDocumentSignature, getDocumentUploadType } from '@/lib/document-upload-type';
import {
  MAX_DOCUMENT_UPLOAD_BYTES,
  MAX_DOCUMENT_UPLOAD_MB,
} from '@/lib/upload-config';

export default function UploadPage() {
  const router = useRouter();
  const uploadRequest=useRef<XMLHttpRequest|null>(null);
  const selectionRequest = useRef(0);
  useEffect(() => () => {
    selectionRequest.current++;
    uploadRequest.current?.abort();
  }, []);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [phase,setPhase]=useState('');
  const [error, setError] = useState('');

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if(loading)return;
    const droppedFile = e.dataTransfer.files[0];
    if(droppedFile)validateAndSetFile(droppedFile);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) validateAndSetFile(selectedFile);
  };

  const validateAndSetFile = async (f: File) => {
    if (loading) return;
    const request = ++selectionRequest.current;
    setError('');
    setFile(null);
    setChecking(false);
    // Check size before reading even the small signature of an unknown file.
    if (f.size > MAX_DOCUMENT_UPLOAD_BYTES) {
      setError(`文件过大，最大支持 ${MAX_DOCUMENT_UPLOAD_MB}MB.`);
      return;
    }

    let type = getDocumentUploadType(f);
    if (!type && canInspectDocumentSignature(f)) {
      setChecking(true);
      try {
        const signature = await new Promise<Uint8Array>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
          reader.onerror = () => reject(reader.error ?? new Error('File read failed'));
          reader.readAsArrayBuffer(f.slice(0, 4));
        });
        type = getDocumentUploadType(f, signature);
      } catch {
        if (request !== selectionRequest.current) return;
        setChecking(false);
        setError('读取文件失败，请重新选择。');
        return;
      }
    }
    if (request !== selectionRequest.current) return;
    setChecking(false);
    if (!type) {
      setError('仅支持 PDF 和 EPUB 文件。');
      return;
    }
    setFile(f);
  };

  const handleUpload = async () => {
    if (!file||loading||checking) return;
    setLoading(true);setPhase('准备文件…');
    setError('');

    try {
      const form=new FormData();form.set('file',file);
      await new Promise<void>((resolve,reject)=>{
        const xhr=new XMLHttpRequest();uploadRequest.current=xhr;
        xhr.open('POST','/api/documents/upload');
        xhr.upload.onprogress=e=>{if(e.lengthComputable)setPhase(e.loaded===e.total?'正在保存书籍…':'上传文件 '+Math.round(e.loaded/e.total*100)+'%');};
        xhr.onload=()=>{try{const result=JSON.parse(xhr.responseText);if(xhr.status>=200&&xhr.status<300&&result.success)resolve();else reject(new Error(result.error||'上传失败，请重试。'));}catch{reject(new Error('服务器响应异常，请重试。'));}};
        xhr.onerror=()=>reject(new Error('网络连接失败，请重试。'));
        xhr.onabort=()=>reject(new Error('已取消上传。'));
        xhr.send(form);
      });
      router.push('/documents');router.refresh();
    } catch(err){setError((err as Error).message);}
    finally{uploadRequest.current=null;setLoading(false);}
  };

  return (
    <div className="cat-page-shell mx-auto flex min-h-[calc(100vh-4rem)] max-w-4xl items-center justify-center">
      <Card className="relative z-10 w-full max-w-2xl p-4 md:p-8">
        <CardHeader className="text-center">

          <CardTitle className="text-4xl font-semibold text-foreground">导入书籍</CardTitle>
          <CardDescription className="text-foreground">
            支持 PDF 和 EPUB，最大{' '}
            {MAX_DOCUMENT_UPLOAD_MB}MB。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className={`rounded-xl border-2 border-dashed p-12 text-center transition-colors ${
              file ? 'border-primary bg-muted shadow-inner ' : 'border-border bg-card hover:border-primary hover:bg-muted'
            }`}
          >
            {file ? (
              <div className="flex flex-col items-center space-y-4">
                <div className="rounded-full bg-muted p-4">
                  <FileText className="h-12 w-12 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-foreground [overflow-wrap:anywhere]">{file.name}</h3>
                  <p className="text-sm text-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                <Button disabled={loading} variant="outline" size="sm" onClick={() => setFile(null)}>移除</Button>
              </div>
            ) : (
              <div className="flex flex-col items-center space-y-4">
                <div className="rounded-full bg-muted p-4 text-4xl shadow-inner ">
                  <UploadCloud className="h-10 w-10 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">将文件拖到这里</h3>
                  <p className="mt-1 text-sm text-foreground">或选择设备上的文件</p>
                </div>
                <input
                  type="file"
                  id="file-upload"
                  className="hidden"
                  accept=".pdf,.epub,.zip,application/pdf,application/epub+zip,application/x-epub+zip,application/zip,application/x-zip-compressed,application/octet-stream"
                  onChange={handleFileChange}
                />
                <Button variant="secondary" onClick={() => document.getElementById('file-upload')?.click()}>
                  选择文件
                </Button>
              </div>
            )}
          </div>

          {checking && <p role="status" className="mt-4 text-sm text-muted-foreground">正在识别文件类型…</p>}
          {loading&&phase!=='正在保存书籍…'&&<Button variant="outline" onClick={()=>uploadRequest.current?.abort()}>取消上传</Button>}
          {error && (
            <div role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-600">
              {error}
            </div>
          )}

          <div className="mt-8 flex justify-end">
            <Button size="lg" disabled={!file || loading || checking} onClick={handleUpload}>
              {loading ? phase : '导入书籍'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
