'use client';
import {useEffect,useRef,useState} from 'react';
import {consumeAIStream} from '@/lib/ai-stream';
import {studyRequest} from './study-request';
import type {JobPublic} from '@/server/vocabulary/jobs';
export default function EnrichmentProgress({id,onComplete}:{id:string;onComplete:(targetSenseId?:string)=>void}){
 const completeRef=useRef(onComplete);completeRef.current=onComplete;
 const [job,setJob]=useState<JobPublic|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0),[busy,setBusy]=useState(false);
 useEffect(()=>{const abort=new AbortController(),url='/api/study/vocabulary/'+encodeURIComponent(id)+'/enrichment';
  void (async()=>{try{
   const initial=await studyRequest<JobPublic>(url,{signal:abort.signal});if(abort.signal.aborted)return;setJob(initial);setError('');
   if(!['queued','running'].includes(initial.status))return;
   const response=await fetch(url,{headers:{Accept:'application/x-ndjson'},signal:abort.signal,cache:'no-store'});
   const final=await consumeAIStream<JobPublic>(response,abort.signal,event=>{if(event.type==='unit'||event.type==='complete')setJob(event.value);});
   if(!abort.signal.aborted)completeRef.current(final.targetSenseId||undefined);
  }catch(error){if(!abort.signal.aborted)setError(error instanceof Error?error.message:'整理进度暂不可用');}})();return()=>abort.abort();
 },[id,retry]);
 async function retryJob(){setBusy(true);setError('');try{await studyRequest('/api/study/vocabulary/'+encodeURIComponent(id)+'/enrichment',{method:'POST',body:'{}'});setRetry(v=>v+1);}catch(error){setError(error instanceof Error?error.message:'重试失败');}finally{setBusy(false);}}
 if(job?.status==='complete')return null;
 return <section className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground" aria-label="自动整理进度"><p role="status">{job?.status==='failed'?'自动整理未完成，收藏已保留':job?.status==='running'?'正在分析当前语境…':'等待自动整理'}</p>{job?.progress.draft&&<p className="mt-2 whitespace-pre-wrap leading-6">中文语境释义草稿 · 尚未校验<br/>{job.progress.draft}</p>}{error&&<p className="mt-2" role="alert">{error}</p>}{(job?.status==='failed'||error)&&<button className="mt-2 underline" disabled={busy} onClick={()=>void retryJob()}>重试整理／刷新进度</button>}</section>;
}
