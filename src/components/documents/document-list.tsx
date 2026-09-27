'use client';

import {ConfirmDialog} from '@/components/ui/confirm-dialog';
import {filterLibrary} from './library-model';
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
  const [view,setView]=useState<'grid'|'list'>('grid');
  const [action,setAction]=useState<{kind:'rename'|'delete';doc:DocumentListItem}|null>(null);
  const [title,setTitle]=useState('');
  const [busy,setBusy]=useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('recent');
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string[]>([]);
  const visible = filterLibrary(documents,query).sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title) : sort === 'upload' ? +new Date(b.createdAt) - +new Date(a.createdAt) : +new Date(b.readingProgress?.[0]?.updatedAt ?? b.createdAt) - +new Date(a.readingProgress?.[0]?.updatedAt ?? a.createdAt));
  const handleRename = async (doc: DocumentListItem) => {
    const nextTitle=title.trim();
    if (!nextTitle || nextTitle === doc.title) {setAction(null);return;}
    setError('');
    try {
      const response = await fetch('/api/documents/' + doc.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title:nextTitle }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to rename book');
      setDocuments(list => list.map(d => d.id === doc.id ? { ...d, title: payload.title } : d));setAction(null);
    } catch (e) { setError((e as Error).message); }
  };

  const handleDelete = async (documentId: string) => {
    if (deleting.includes(documentId)) return;

    setError('');
    setDeleting(current => [...current, documentId]);
    try {
      const response = await fetch(`/api/documents/${documentId}`, { method: 'DELETE' });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || '删除未完成，请重试。');
      }
      setDocuments(current => current.filter(doc => doc.id !== documentId));setAction(null);
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


  const recent=documents.filter(d=>d.readingProgress?.length).sort((a,b)=>+new Date(b.readingProgress![0].updatedAt)-+new Date(a.readingProgress![0].updatedAt))[0];
  return <div className="space-y-7">
    {recent&&!query&&<Link href={'/reader/'+recent.id} className="flex items-center justify-between gap-5 rounded-xl border border-border bg-card p-5"><div className="min-w-0"><p className="mb-2 text-xs font-medium text-muted-foreground">继续阅读</p><h2 className="truncate font-semibold">{recent.title}</h2><p className="mt-2 text-xs text-muted-foreground">已读 {Math.round(recent.readingProgress![0].percentage)}%</p></div><span className="shrink-0 text-primary">继续 →</span></Link>}
    <div className="flex flex-wrap items-center gap-2"><input aria-label="搜索书籍" placeholder="搜索书库" value={query} onChange={e=>setQuery(e.target.value)} className="native-field min-w-0 flex-1"/><select aria-label="排序" value={sort} onChange={e=>setSort(e.target.value)} className="rounded-lg border border-border bg-card p-2.5 text-sm"><option value="recent">最近阅读</option><option value="upload">最近导入</option><option value="title">书名</option></select><button className="native-action" onClick={()=>setView(v=>v==='grid'?'list':'grid')}>{view==='grid'?'列表视图':'网格视图'}</button></div>
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    {!visible.length&&<div className="rounded-xl border border-dashed border-border py-16 text-center"><FileText className="mx-auto mb-4 h-8 w-8 text-muted-foreground"/><h2 className="font-semibold">{documents.length?'没有匹配的书籍':'你的下一段阅读，从这里开始'}</h2><p className="mt-2 text-sm text-muted-foreground">{documents.length?'换个关键词，或清空搜索。':'导入 PDF 或 EPUB，建立自己的书库。'}</p>{!documents.length&&<Link href="/upload" className="native-action mt-5">导入第一本书</Link>}</div>}
    <div className={view==='grid'?'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3':'space-y-3'}>
      {visible.map(doc=>{
        const deletingNow=deleting.includes(doc.id),pending=doc.status==='DELETING',ready=doc.parseStatus==='COMPLETED'&&!pending&&!deletingNow;
        return <article key={doc.id} className={'relative min-w-0 rounded-xl border border-border bg-card '+(view==='list'?'flex items-center':'')}>
          <Link href={ready?'/reader/'+doc.id:'#'} aria-disabled={!ready} onClick={e=>{if(!ready)e.preventDefault();}} className={'block min-w-0 flex-1 '+(view==='list'?'p-5':'')}>
            {view==='grid'&&<div className="flex h-40 flex-col justify-end rounded-t-xl border-b border-border bg-muted/60 px-5 pb-5 pt-8"><span className="mb-3 text-[10px] tracking-[.2em] text-muted-foreground">{doc.fileType} / DEEPREADER</span><p className="line-clamp-3 max-w-[85%] font-serif text-xl leading-6 [overflow-wrap:anywhere]">{doc.title}</p></div>}
            <div className={view==='grid'?'p-5':''}><h3 className="line-clamp-2 pr-6 text-sm font-medium [overflow-wrap:anywhere]">{doc.title}</h3><p className="mt-2 text-xs text-muted-foreground">{doc.fileType} · {formatFileSize(doc.fileSize)}{doc.readingProgress?.[0]?' · 已读 '+Math.round(doc.readingProgress[0].percentage)+'%':''}</p>{!ready&&<p role="status" className="mt-3 text-xs text-muted-foreground">{pending?'删除未完成，请重试':deletingNow?'正在删除…':doc.parseStatus==='FAILED'?'解析失败':'正在解析…'}</p>}</div>
          </Link>
          <details className="absolute right-3 top-3"><summary aria-label={'书籍操作 '+doc.title} className="list-none rounded-md bg-card px-2 py-1 text-muted-foreground hover:bg-muted">•••</summary><div className="absolute right-0 z-20 mt-1 w-32 rounded-lg border border-border bg-popover p-1 shadow-lg"><button disabled={deletingNow||pending} className="w-full rounded px-3 py-2 text-left text-sm hover:bg-muted" onClick={()=>{setTitle(doc.title);setError('');setAction({kind:'rename',doc});}}>重命名</button><button disabled={deletingNow} className="w-full rounded px-3 py-2 text-left text-sm text-destructive hover:bg-muted" onClick={()=>{setError('');setAction({kind:'delete',doc});}}>{pending?'重试删除':'删除'}</button></div></details>
        </article>;
      })}
    </div>
    <ConfirmDialog open={Boolean(action)} onClose={()=>setAction(null)} title={action?.kind==='rename'?'重命名书籍':'删除书籍？'} busy={busy} confirmLabel={action?.kind==='rename'?'保存':'删除'} onConfirm={()=>{if(!action)return;setBusy(true);void (action.kind==='rename'?handleRename(action.doc):handleDelete(action.doc.id)).finally(()=>setBusy(false));}}>
      {action?.kind==='rename'?<input aria-label="书名" autoFocus value={title} onChange={e=>setTitle(e.target.value)} className="native-field"/>:<p>将删除这本书及其阅读进度、笔记、生词和 AI 记录。此操作不可撤销。</p>}{error&&<p role="alert" className="mt-2 text-destructive">{error}</p>}
    </ConfirmDialog>
  </div>;
}
