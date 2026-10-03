type Hit={word:string;language:'en'|'es';rect:{left:number;right:number;top:number;bottom:number};replacement?:string};
type POS={parts:string[]};
export function visibleDocumentViewport(doc:Document){
 const win=doc.defaultView,frame=win?.frameElement as HTMLElement|null;
 const own={left:0,top:0,right:win?.innerWidth??360,bottom:win?.innerHeight??600};
 if(!frame)return own;
 const parent=frame.ownerDocument.defaultView;if(!parent)return own;
 const fr=frame.getBoundingClientRect(),v=parent.visualViewport;
 let left=v?.offsetLeft??0,top=v?.offsetTop??0,right=left+(v?.width??parent.innerWidth),bottom=top+(v?.height??parent.innerHeight);
 for(let el:Element|null=frame.parentElement;el;el=el.parentElement){
  const css=parent.getComputedStyle(el),r=el.getBoundingClientRect();
  if(/hidden|clip|scroll|auto/.test(css.overflowX)){left=Math.max(left,r.left);right=Math.min(right,r.right);}
  if(/hidden|clip|scroll|auto/.test(css.overflowY)){top=Math.max(top,r.top);bottom=Math.min(bottom,r.bottom);}
 }
 return {left:Math.max(0,left-fr.left),top:Math.max(0,top-fr.top),right:Math.min(own.right,right-fr.left),bottom:Math.min(own.bottom,bottom-fr.top)};
}
const labels:Record<string,string>={noun:'名词',verb:'动词',adjective:'形容词',adverb:'副词',pronoun:'代词',preposition:'介词',conjunction:'连词',determiner:'限定词',interjection:'感叹词','proper noun':'专有名词',numeral:'数词',article:'冠词'};
export function partOfSpeechLabel(parts:string[]){
 const values=[...new Set(parts.filter(p=>typeof p==='string'&&p.length<40))];
 return values.map(p=>labels[p]?labels[p]+' · '+p:p).join(' / ');
}
/** Debounced local POS only; bounded cache, cancellable requests and no stale tooltip. */
export function createSemanticHover(doc:Document,options:{lookup?:(word:string,language:'en'|'es',signal:AbortSignal)=>Promise<POS>}={}){
 const win=doc.defaultView,cache=new Map<string,POS>(),tip=doc.createElement('div');
 tip.dataset.semanticHover='';tip.dataset.readerProjectionOverlay='';tip.setAttribute('aria-hidden','true');tip.hidden=true;
 tip.style.cssText='position:fixed;z-index:2147483000;pointer-events:none;padding:6px 10px;border-radius:9px;background:#252529;color:#fff;box-shadow:0 4px 16px #0002;font:12px/1.45 -apple-system,BlinkMacSystemFont,sans-serif;white-space:normal;overflow-wrap:anywhere;box-sizing:border-box;max-width:calc(100vw - 24px);';
 tip.style.setProperty('background','#252529','important');tip.style.setProperty('color','#fff','important');
 tip.style.setProperty('display','none','important');doc.documentElement.append(tip);
 let timer:ReturnType<typeof setTimeout>|undefined,abort:AbortController|undefined,current:Hit|undefined,key='',version=0,disposed=false;
 const lookup=options.lookup??(async(word,language,signal)=>{const response=await fetch('/api/dictionary/pos?'+new URLSearchParams({word,language}),{signal});if(!response.ok)throw Error('No POS');return await response.json() as POS;});
 function paint(value?:POS){
  if(!current||disposed)return;
  const label=value?partOfSpeechLabel(value.parts):'';
  tip.textContent=[label?(value!.parts.length>1?'词典词性：':'')+label:'',current.replacement].filter(Boolean).join(' · ');
  tip.hidden=!tip.textContent;tip.style.setProperty('display',tip.hidden?'none':'block','important');if(tip.hidden)return;
  const viewport=visibleDocumentViewport(doc),width=viewport.right-viewport.left,height=viewport.bottom-viewport.top;
  tip.style.maxWidth=Math.max(80,Math.min(360,width-24))+'px';const rect=tip.getBoundingClientRect();
  tip.style.left=Math.max(viewport.left+12,Math.min(current.rect.left,viewport.right-rect.width-12))+'px';
  tip.style.top=Math.max(viewport.top+12,current.rect.top-rect.height-10>=viewport.top+12?current.rect.top-rect.height-10:Math.min(viewport.bottom-rect.height-12,current.rect.bottom+10))+'px';
 }
 function clear(){version++;clearTimeout(timer);abort?.abort();abort=undefined;current=undefined;key='';tip.hidden=true;tip.textContent='';tip.style.setProperty('display','none','important');}
 return {
  show(hit:Hit,{lookupPOS=true}:{lookupPOS?:boolean}={}){
   if(disposed)return;const next=hit.language+':'+hit.word.toLocaleLowerCase();
   if(key===next&&current?.replacement===hit.replacement){current=hit;paint(cache.get(next));return;}
   clear();current=hit;key=next;paint(cache.get(next));
   if(!lookupPOS||cache.has(next)||hit.word.length>64)return;
   const own=version;
   timer=setTimeout(async()=>{
    abort=new AbortController();
    try{const value=await lookup(hit.word,hit.language,abort.signal);if(disposed||own!==version)return;
     if(!Array.isArray(value.parts))return;const safe={parts:value.parts.filter(p=>typeof p==='string').slice(0,8)};
     if(cache.size>=128)cache.delete(cache.keys().next().value!);cache.set(next,safe);paint(safe);
    }catch{/* Missing local POS leaves full replacement visible, never invented metadata. */}
   },300);
  },
  clear,
  dispose(){if(disposed)return;clear();disposed=true;cache.clear();tip.remove();},
 };
}
