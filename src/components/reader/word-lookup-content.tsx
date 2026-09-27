'use client';
import {useEffect,useState,useRef} from 'react';
import {Star,Volume2} from 'lucide-react';
import {useReaderStore} from '@/hooks/use-reader-store';
import {readingRequest} from './reading-tools';
import {startLookup} from './lookup-session';
import {speakInBrowser} from './language-tools';
import {FormattedText} from '@/components/ui/formatted-text';
import type {ReadingSelection,ReadingEntry,Dictionary,Answer} from '@/types/reading-tools';
export default function WordLookupContent({documentId,selection,entries,onSave}:{documentId:string;selection:ReadingSelection|null;entries:ReadingEntry[];onSave:(kind:string,text:string,note?:string,location?:string)=>Promise<void>}){
 const {sourceLanguage,explanationLanguage,bilingualMode,readingLevel}=useReaderStore();
 const [dictionary,setDictionary]=useState<Dictionary|null>(null),[answer,setAnswer]=useState<Answer|null>(null);
 const [errors,setErrors]=useState<Record<string,string>>({}),[pending,setPending]=useState({dictionary:true,context:true});
 const generation=useRef(0);
 const speechController=useRef<AbortController|null>(null);
 const audio=useRef<HTMLAudioElement|null>(null);
 const extraController=useRef<AbortController|null>(null);
 const [extra,setExtra]=useState(''),[extraBusy,setExtraBusy]=useState(false);
 const [retry,setRetry]=useState(0),[saving,setSaving]=useState(false),[notice,setNotice]=useState('');
 const word=selection?.text.trim()||'',context=selection?.contextText||word;
 const saved=entries.some(e=>e.kind==='word'&&e.text===word&&e.location===selection?.location);
 useEffect(()=>{
  generation.current++;speechController.current?.abort();audio.current?.pause();extraController.current?.abort();setExtra('');setExtraBusy(false);const c=new AbortController();setSaving(false);setDictionary(null);setAnswer(null);setErrors({});setNotice('');setPending({dictionary:true,context:true});
  if(!word)return()=>c.abort();
  void startLookup({
   signal:c.signal,
   dictionary:()=>readingRequest('/api/dictionary?word='+encodeURIComponent(word.normalize('NFC'))+'&language='+sourceLanguage,{signal:c.signal}),
   context:()=>readingRequest('/api/reading-assistant',{method:'POST',signal:c.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({documentId,mode:'word',targetWord:word,text:context.slice(0,24000),previousText:selection?.previousText?.slice(0,6000),nextText:selection?.nextText?.slice(0,6000),question:'Give the current meaning first, then briefly explain why it fits this sentence. Keep it concise.',level:readingLevel,language:explanationLanguage,definitionMode:bilingualMode?'bilingual':'monolingual',sourceLanguage})})
  },event=>{
   setPending(p=>({...p,[event.source]:false}));
   if(event.status==='error')setErrors(e=>({...e,[event.source]:event.message}));
   else if(event.source==='dictionary')setDictionary(event.data as Dictionary);else setAnswer(event.data as Answer);
  });
  return()=>{speechController.current?.abort();audio.current?.pause();c.abort();extraController.current?.abort();window.speechSynthesis?.cancel();};
 },[word,context,selection,sourceLanguage,explanationLanguage,bilingualMode,readingLevel,documentId,retry]);
 async function pronounce(){
  const id=generation.current;speechController.current?.abort();const c=new AbortController();speechController.current=c;setNotice('');audio.current?.pause();window.speechSynthesis?.cancel();
  try{
   if(dictionary?.audioUrl){
    const player=new Audio(dictionary.audioUrl);audio.current=player;
    try{await player.play();return;}catch{if(id!==generation.current||c.signal.aborted)return;}
   }
   await speakInBrowser(word,sourceLanguage,c.signal);
  }catch{if(id===generation.current&&!c.signal.aborted)setNotice('发音暂不可用，可先参考音标。');}
 }
 async function expand(topic:string){
  extraController.current?.abort();const c=new AbortController();extraController.current=c;setExtraBusy(true);setExtra('');
  try{const data=await readingRequest('/api/reading-assistant',{method:'POST',signal:c.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({documentId,mode:'ask',text:context.slice(0,24000),question:topic+': '+word,sourceLanguage,language:explanationLanguage,definitionMode:bilingualMode?'bilingual':'monolingual',level:readingLevel})});if(!c.signal.aborted)setExtra(data.answer);}
  catch{if(!c.signal.aborted)setExtra('补充解释暂不可用，请重试。');}finally{if(!c.signal.aborted)setExtraBusy(false);}
 }
 async function save(){const id=generation.current;setSaving(true);try{await onSave('word',word,JSON.stringify({...dictionary,aiExplanation:answer?.answer,context,sourceLanguage,dictionaryAvailable:Boolean(dictionary)}),selection?.location);if(id===generation.current)setNotice('已加入生词');}catch{if(id===generation.current)setNotice('收藏失败，请重试。');}finally{if(id===generation.current)setSaving(false);}}
 if(!word)return <p className="p-5 text-sm text-muted-foreground">点击正文中的单词，查看语境释义。</p>;
 return <div className="h-full overflow-y-auto overscroll-contain p-4 pb-8">
  <div className="flex items-start justify-between gap-2"><div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1"><h2 className="text-2xl font-semibold tracking-tight [overflow-wrap:anywhere]">{word}</h2>{dictionary?.phonetic&&<span className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{dictionary.phonetic}</span>}</div><div className="flex shrink-0"><button type="button" className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-primary" aria-label="朗读单词" onClick={()=>void pronounce()}><Volume2 size={18}/></button><button type="button" aria-label={saved?'已收藏':'收藏单词'} aria-pressed={saved} disabled={saved||saving} onClick={()=>void save()} className="rounded-lg p-2 text-primary hover:bg-muted"><Star size={19} fill={saved?'currentColor':'none'}/></button></div></div>
  {notice&&<p role="status" className="mb-3 text-xs text-muted-foreground">{notice}</p>}
  <section aria-label="语境解析" className="border-t border-border py-3"><h3 className="mb-2 text-xs font-medium text-muted-foreground">在这句话中</h3>{pending.context?<p role="status" className="text-sm text-muted-foreground">正在结合上下文理解…</p>:errors.context?<div role="alert" className="text-sm">{errors.context}<a className="ml-1 text-primary" href="/settings/ai">查看设置</a><button className="ml-2 text-primary" onClick={()=>setRetry(n=>n+1)}>重试</button></div>:answer&&<FormattedText text={answer.answer}/>}</section>
  <details className="mt-3 text-sm"><summary className="cursor-pointer text-muted-foreground">词典释义{dictionary?.meanings[0]?.partOfSpeech?` · ${dictionary.meanings[0].partOfSpeech}`:''}</summary><section aria-label="词典释义" className="py-2">{pending.dictionary?<p role="status">正在查词…</p>:errors.dictionary?<p className="text-muted-foreground">{errors.dictionary}<button className="ml-2 text-primary" onClick={()=>setRetry(n=>n+1)}>重试</button></p>:dictionary?.meanings.map((m,i)=><div key={i} className="mb-3"><span className="italic text-muted-foreground">{m.partOfSpeech}</span>{m.definitions.map((d,j)=><p key={j} className="mt-1 leading-6">{d.definition}</p>)}</div>)}</section></details>
  <details className="mt-3 text-sm"><summary className="cursor-pointer text-muted-foreground">查看原文</summary><blockquote className="mt-2 border-l-2 border-primary/30 pl-3 leading-6 text-muted-foreground [overflow-wrap:anywhere]">{highlightContext(context,word)}</blockquote></details>
  <details className="mt-4 border-t border-border pt-3"><summary className="cursor-pointer text-xs text-muted-foreground">进一步理解</summary><div className="my-3 flex flex-wrap gap-2">{['例句','常见搭配','词根与词源','近义词辨析'].map(topic=><button key={topic} className="native-action" disabled={extraBusy} onClick={()=>void expand(topic)}>{topic}</button>)}</div>{extraBusy?<p role="status" className="text-xs text-muted-foreground">正在解析…</p>:extra&&<FormattedText text={extra}/>}</details>
  {dictionary?.sourceUrl&&<p className="mt-4 text-xs text-muted-foreground"><a href={dictionary.sourceUrl} target="_blank" rel="noreferrer" className="hover:underline">Wiktionary</a> · {dictionary.source}{dictionary.licenseUrl&&<> · <a href={dictionary.licenseUrl} target="_blank" rel="noreferrer" className="hover:underline">许可</a></>}</p>}
  <details className="mt-4 text-xs text-muted-foreground"><summary className="cursor-pointer">来源与模型</summary><p className="mt-2">{dictionary?.attribution||dictionary?.source||'词典服务'} · {answer?.provider} {answer?.model}</p></details>
 </div>;
}

function highlightContext(context:string,word:string){
 const at=context.toLocaleLowerCase().indexOf(word.toLocaleLowerCase());
 if(at<0)return context;
 return <>{context.slice(0,at)}<mark className="rounded bg-primary/15 text-inherit">{context.slice(at,at+word.length)}</mark>{context.slice(at+word.length)}</>;
}
