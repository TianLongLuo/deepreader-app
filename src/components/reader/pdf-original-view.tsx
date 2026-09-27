'use client';
import { useEffect, useRef, useState } from 'react';
import { loadPdfLibrary, pdfResourceOptions } from '@/lib/pdf-browser';
type Props={documentId:string;title:string;page:number;onPageReady:(page:number)=>void};
export default function PdfOriginalView({documentId,title,page,onPageReady}:Props){
 const canvasRef=useRef<HTMLCanvasElement>(null),readyRef=useRef(onPageReady);
 useEffect(()=>{readyRef.current=onPageReady;},[onPageReady]);
 const [zoom,setZoom]=useState('fit'),[retry,setRetry]=useState(0);
 const [status,setStatus]=useState<'loading'|'ready'|'error'>('loading');
 useEffect(()=>{
  let cancelled=false; let loading: import('pdfjs-dist/types/src/display/api').PDFDocumentLoadingTask|undefined;
  let render: import('pdfjs-dist/types/src/display/api').RenderTask|undefined;
  (async()=>{
   setStatus('loading');
   try{
    const pdf=await loadPdfLibrary(); if(cancelled)return;
    loading=pdf.getDocument({url:'/api/documents/'+documentId+'/raw',withCredentials:true,...pdfResourceOptions,isEvalSupported:false});
    const book=await loading.promise; if(cancelled)return;
    const physical=await book.getPage(page); if(cancelled)return;
    const natural=physical.getViewport({scale:1});
    const scale=Math.min(2,1600/natural.width,2400/natural.height,Math.sqrt(4_000_000/(natural.width*natural.height)));
    const viewport=physical.getViewport({scale}); const canvas=canvasRef.current; if(!canvas)return;
    canvas.width=Math.ceil(viewport.width); canvas.height=Math.ceil(viewport.height);
    canvas.dataset.naturalWidth=String(natural.width);
    render=physical.render({canvas,viewport}); await render.promise;
    if(!cancelled){setStatus('ready');readyRef.current(page);}
   }catch{if(!cancelled)setStatus('error');}
  })();
  return ()=>{cancelled=true;render?.cancel();void loading?.destroy();};
 },[documentId,page,retry]);
 return <div className="flex min-h-0 flex-1 flex-col">
  <div className="shrink-0 border-b p-3 text-sm"><label>缩放 <select aria-label="书页缩放" className="rounded-lg border bg-transparent p-2" value={zoom} onChange={e=>setZoom(e.target.value)}><option value="fit">适宽</option><option value="actual">100%</option></select></label></div>
  <div className="min-h-0 flex-1 overflow-auto bg-black/10 p-3">
   {status==='loading'&&<p role="status">正在加载第 {page} 页…</p>}
   {status==='error'&&<div role="alert">此页加载失败，不会保存未加载的页码。<button className="ml-3 underline" onClick={()=>setRetry(n=>n+1)}>重试</button></div>}
   <canvas ref={canvasRef} role="img" aria-label={title+'，第 '+page+' 页'} className="mx-auto block bg-card shadow-lg" style={{display:status==='ready'?'block':'none',width:zoom==='fit'?'100%':canvasRef.current?.dataset.naturalWidth+'px',height:'auto'}}/>
  </div>
 </div>;
}
