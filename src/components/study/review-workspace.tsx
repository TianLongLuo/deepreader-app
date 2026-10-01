'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {ReviewFront,MeaningLanguage,SourceLanguage} from '@/server/vocabulary/types';
import {wordSpans} from './word-display';
import {studyRequest,StudyRequestError} from './study-request';
type Back={meaning:string;collocation:string|null;definitionLanguage?:string;fallback?:boolean};
export function ReviewCardFront({front,onReveal,disabled=false}:{front:ReviewFront;onReveal:()=>void;disabled?:boolean}){return <section aria-label="复习卡正面" className="space-y-8"><p className="text-xl leading-relaxed sm:text-2xl">{wordSpans(front.sentence,front.word).map((part,i)=>part.highlight?<strong key={i} className="font-semibold text-primary">{part.text}</strong>:part.text)}</p><p className="text-sm text-muted-foreground">这里的 <strong className="text-foreground">{front.word}</strong> 是什么意思？</p><button type="button" onClick={onReveal} disabled={disabled} className="min-h-11 rounded-xl bg-primary px-6 py-3 text-sm font-medium text-primary-foreground disabled:opacity-50">显示答案</button></section>;}
export default function ReviewWorkspace({definitionLanguage,sourceLanguage}:{definitionLanguage:MeaningLanguage;sourceLanguage?:SourceLanguage}){
 const [front,setFront]=useState<ReviewFront|null>(null),[back,setBack]=useState<Back|null>(null),[busy,setBusy]=useState('load'),[error,setError]=useState(''),[stale,setStale]=useState(false),[done,setDone]=useState(0),[nextDue,setNextDue]=useState<string|null>(null),[retryRating,setRetryRating]=useState<'again'|'good'|null>(null);
 const generation=useRef(0),controller=useRef<AbortController|null>(null),operation=useRef<{id:string;sessionId:string;rating:'again'|'good'}|null>(null);
 const load=useCallback(async()=>{
  controller.current?.abort();const abort=new AbortController();controller.current=abort;const id=++generation.current;
  setFront(null);setBack(null);setError('');setStale(false);setRetryRating(null);operation.current=null;setBusy('load');
  try{const data=await studyRequest<{front:ReviewFront|null;nextDue:string|null}>('/api/study/review?definitionLanguage='+definitionLanguage+(sourceLanguage?'&sourceLanguage='+sourceLanguage:''),{signal:abort.signal});if(id===generation.current&&!abort.signal.aborted){setFront(data.front);setNextDue(data.nextDue);}}
  catch(error){if(id===generation.current&&!abort.signal.aborted)setError(error instanceof Error?error.message:'复习卡加载失败');}
  finally{if(id===generation.current&&!abort.signal.aborted)setBusy('');}
 },[definitionLanguage,sourceLanguage]);
 useEffect(()=>{setDone(0);void load();return()=>{generation.current++;controller.current?.abort();};},[load]);
 async function reveal(){if(!front||busy)return;const id=generation.current;setBusy('reveal');setError('');try{const value=await studyRequest<Back>('/api/study/review/reveal',{method:'POST',body:JSON.stringify({sessionId:front.sessionId}),signal:controller.current?.signal});if(id===generation.current)setBack(value);}catch(error){if(id===generation.current&&!controller.current?.signal.aborted){setError(error instanceof Error?error.message:'翻面失败');setStale(error instanceof StudyRequestError&&error.status===409);}}finally{if(id===generation.current)setBusy('');}}
 async function rate(rating:'again'|'good'){
  if(!front||!back||busy||stale)return;const id=generation.current;setBusy('rating');setError('');
  if(!operation.current)operation.current={id:crypto.randomUUID(),sessionId:front.sessionId,rating};const op=operation.current;
  setRetryRating(op.rating);
  try{await studyRequest('/api/study/review/rate',{method:'POST',body:JSON.stringify({sessionId:op.sessionId,operationId:op.id,rating:op.rating}),signal:controller.current?.signal});if(id===generation.current){setDone(v=>v+1);await load();}}
  catch(error){if(id===generation.current&&!controller.current?.signal.aborted){setError(error instanceof Error?error.message:'评分失败');setStale(error instanceof StudyRequestError&&error.status===409);}}
  finally{if(id===generation.current)setBusy('');}
 }
 return <div className="mx-auto max-w-2xl py-6 sm:py-12"><div className="mb-5 flex items-center justify-between text-xs text-muted-foreground"><span>今日完成 {done} 张</span>{front&&<span>剩余 {front.remaining} 张</span>}</div><div className="rounded-2xl border border-border bg-card p-6 sm:p-10">
  {busy==='load'?<p role="status">正在准备复习…</p>:front?<>{!back?<ReviewCardFront front={front} onReveal={()=>void reveal()} disabled={Boolean(busy)||stale}/>:<section aria-label="复习卡答案" className="space-y-6"><p className="text-lg leading-relaxed">{wordSpans(front.sentence,front.word).map((part,i)=>part.highlight?<strong key={i}>{part.text}</strong>:part.text)}</p><div><p className="text-xl font-medium leading-relaxed">{back.meaning}</p>{back.fallback&&<p className="mt-2 text-xs text-muted-foreground">{back.definitionLanguage==='legacy'?'旧释义，语言尚未分类':'所选语言暂无释义，显示'+(back.definitionLanguage==='en'?'英文':'中文')+'释义'}</p>}{back.collocation&&<p className="mt-4 text-sm text-muted-foreground">搭配：{back.collocation}</p>}</div>{!stale&&(retryRating&&error?<button className="native-action" disabled={Boolean(busy)} onClick={()=>void rate(retryRating)}>重试评分</button>:<div className="grid grid-cols-2 gap-3"><button className="native-action min-h-11" disabled={Boolean(busy)} onClick={()=>void rate('again')}>没想起来</button><button className="min-h-11 rounded-lg bg-primary px-3 text-sm text-primary-foreground disabled:opacity-50" disabled={Boolean(busy)} onClick={()=>void rate('good')}>想起来了</button></div>)}</section>}</>:!error?<div className="space-y-3"><h2 className="text-xl font-semibold">今天的复习已完成</h2><p className="text-sm text-muted-foreground">{nextDue?'下次到期：'+new Date(nextDue).toLocaleString():'阅读时收藏词语，补充语境释义后即可开始复习。'}</p></div>:null}
  {busy&&busy!=='load'&&<p role="status" className="mt-4 text-xs text-muted-foreground">{busy==='reveal'?'正在翻面…':'正在保存评分…'}</p>}
  {error&&<div className="mt-5 space-y-3"><p role="alert" className="text-sm text-destructive">{error}</p>{(stale||!front)&&<button className="native-action" disabled={Boolean(busy)} onClick={()=>void load()}>重新获取卡片</button>}</div>}
 </div></div>;
}
