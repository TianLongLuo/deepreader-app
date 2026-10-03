import {visibleDocumentViewport} from './semantic-hover';
type DisplayChange={id:string;range:Range;replacement:string};
type PaintedChange=DisplayChange&{phase:'pending'|'complete'|'restore'|'idle'};
let serial=0;
/** Keep an entire gloss readable; never truncate a word or shrink it into illegibility. */
export function semanticLabelFit(available:number,natural:number,fontSize:number){
 const fitted=natural>0?Math.min(fontSize,fontSize*available/natural):fontSize;
 const minimum=Math.min(fontSize,Math.max(10,Math.min(12,fontSize*.6)));
 return fitted>=minimum?{fontSize:fitted,showReplacement:true}:{fontSize,showReplacement:false};
}
/** Paint only in original glyph boxes. Presentation stays outside the book body's mapping tree. */
export function createStableFlipLayer(root:Element){
 const doc=root.ownerDocument,win=doc.defaultView,name='reader-flip-'+(++serial);
 const layer=doc.createElement('div');layer.dataset.readerProjectionOverlay='';layer.setAttribute('aria-hidden','true');
 layer.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:2;contain:strict;overflow:hidden;';
 const style=doc.createElement('style');style.dataset.readerProjectionOverlay='';
 style.textContent=`
 ::highlight(${name}){color:transparent;text-shadow:none;}
 ::highlight(${name}-full){text-decoration:underline dotted #4384cc;}
 [data-reader-projection-overlay] [data-semantic-slot]{transform-origin:center;backface-visibility:hidden;}
 [data-reader-projection-overlay] [data-semantic-state=pending] [data-semantic-slot]{transform:perspective(220px) rotateY(-18deg);transition:transform 120ms cubic-bezier(.22,1,.36,1);animation:reader-word-wait 1200ms ease-in-out infinite;}
 [data-reader-projection-overlay] [data-semantic-state=complete] [data-semantic-slot]{animation:reader-word-turn 180ms cubic-bezier(.22,1,.36,1) both;}
 [data-reader-projection-overlay] [data-semantic-state=restore] [data-semantic-slot]{animation:reader-word-return 150ms cubic-bezier(.22,1,.36,1) both;}
 @starting-style{[data-reader-projection-overlay] [data-semantic-state=pending] [data-semantic-slot]{transform:perspective(220px) rotateY(0);}}
 @keyframes reader-word-wait{0%,100%{opacity:1}50%{opacity:.58}}
 @keyframes reader-word-turn{from{transform:perspective(220px) rotateY(85deg);opacity:.55}to{transform:perspective(220px) rotateY(0);opacity:1}}
 @keyframes reader-word-return{from{transform:perspective(220px) rotateY(-85deg);opacity:.55}to{transform:perspective(220px) rotateY(0);opacity:1}}
 @media(prefers-reduced-motion:reduce){[data-reader-projection-overlay] [data-semantic-slot]{animation:none!important;transition:none!important;transform:none!important;}}
 `;
 doc.head.append(style);doc.documentElement.append(layer);
 let records:DisplayChange[]=[],raf=0,disposed=false;
 const waiting=new Map<string,DisplayChange>(),returning=new Map<string,DisplayChange>(),groups=new Map<string,HTMLElement>(),completedMotion=new Set<string>(),timers=new Map<string,ReturnType<typeof setTimeout>>();
 const cssWin=win as (Window & {CSS?:{highlights?:Map<string,unknown>};Highlight?:new(...r:Range[])=>{priority:number}})|null;
 const colored=Boolean(cssWin?.CSS?.highlights&&cssWin.Highlight);
 function background(el:Element|null){while(el){const value=win?.getComputedStyle(el).backgroundColor;if(value&&value!=='rgba(0, 0, 0, 0)'&&value!=='transparent')return value;el=el.parentElement;}return win?.getComputedStyle(doc.documentElement).colorScheme==='dark'?'#171717':'#fff';}
 function sourceColor(el:Element|null):string{while(el){const value=win?.getComputedStyle(el).color;if(value&&value!=='inherit')return value;el=el.parentElement;}return '#242424';}
 function paint(){
  if(disposed)return;
  const entries:PaintedChange[]=[...records.map(r=>({...r,phase:completedMotion.has(r.id)?'complete' as const:'idle' as const})),...[...waiting.values()].map(r=>({...r,phase:'pending' as const})),...[...returning.values()].map(r=>({...r,phase:'restore' as const}))];
  const visible=entries.filter(r=>r.range.startContainer.isConnected);
  const masked:Range[]=[],full:Range[]=[];
  const ids=new Set(visible.map(r=>r.id));for(const [id,group] of groups)if(!ids.has(id)){group.remove();groups.delete(id);}
  const viewport=visibleDocumentViewport(doc);
  for(const record of visible){
   const node=record.range.startContainer,parent=node.nodeType===1?node as Element:node.parentElement,css=parent?win?.getComputedStyle(parent):null;
   let group=groups.get(record.id);if(!group){group=doc.createElement('div');group.dataset.semanticOccurrence=record.id;groups.set(record.id,group);layer.append(group);}
   if(group.dataset.semanticState!==record.phase)group.dataset.semanticState=record.phase;
   if(record.phase==='pending'){group.dataset.semanticPending='';delete group.dataset.semanticReplacement;}else if(record.phase==='restore'){delete group.dataset.semanticPending;delete group.dataset.semanticReplacement;}else{group.dataset.semanticReplacement=record.replacement;delete group.dataset.semanticPending;}
   const rects=typeof record.range.getClientRects==='function'?Array.from(record.range.getClientRects()).filter(r=>r.width>0&&r.height>0):[];
   const boxes:{left:number;top:number;width:number;height:number}[]=[];
   for(const r of rects){const last=boxes.at(-1);if(last&&Math.abs(last.top-r.top)<1&&Math.abs(last.height-r.height)<2&&r.left<=last.left+last.width+1)last.width=Math.max(last.width,r.right-last.left);else boxes.push({left:r.left,top:r.top,width:r.width,height:r.height});}
   // Keep the same compositor nodes while scrolling/resizing: do not restart the flip.
   while(group.children.length>boxes.length)group.lastElementChild!.remove();
   let fitted=true;
   boxes.forEach((box,i)=>{
    let span=group!.children[i] as HTMLElement|undefined;if(!span){span=doc.createElement('span');span.dataset.semanticSlot='';span.style.cssText='position:absolute;display:flex;align-items:center;justify-content:center;box-sizing:border-box;white-space:nowrap;overflow:visible;text-overflow:clip;pointer-events:none;margin:0;padding:0;border:0;';const label=doc.createElement('span');label.dataset.semanticLabel='';label.style.cssText='display:inline-block;flex:none;white-space:nowrap;overflow:visible;margin:0;padding:0;border:0;';span.append(label);group!.append(span);}
    const label=span.firstElementChild as HTMLElement;label.textContent=i===0?record.replacement:'';
    Object.assign(span.style,{left:box.left+'px',top:box.top+'px',width:box.width+'px',height:box.height+'px',});
    // The book's universal !important rules must never own presentation glyph metrics.
    const fontSize=parseFloat(css?.fontSize||'18')||18;
    for(const [key,value] of Object.entries({'font-family':css?.fontFamily||'system-ui,sans-serif','font-size':fontSize+'px','font-weight':css?.fontWeight||'400','font-style':css?.fontStyle||'normal','line-height':'1.25','letter-spacing':'normal','word-spacing':'normal','color':sourceColor(parent)}))label.style.setProperty(key,value,'important');
    // scrollWidth is unaffected by the in-flight 3D transform.
    const natural=label.scrollWidth;
    const fit=i===0&&record.phase!=='pending'&&record.phase!=='restore'?semanticLabelFit(box.width,natural,fontSize):{fontSize,showReplacement:true};
    label.style.setProperty('font-size',fit.fontSize+'px','important');
    fitted&&=fit.showReplacement;span.style.visibility=fit.showReplacement?'visible':'hidden';
    span.style.setProperty('background-color',colored?'transparent':background(parent),'important');
    // Without transparent source masking, rotating an opaque cover would reveal duplicate glyphs.
    if(!colored){span.style.setProperty('animation','none','important');span.style.setProperty('transition','none','important');span.style.setProperty('transform','none','important');}
    span.style.animationPlayState=record.phase!=='pending'||box.left+box.width>viewport.left&&box.left<viewport.right&&box.top+box.height>viewport.top&&box.top<viewport.bottom?'running':'paused';
   });
   // A fallback is for the whole occurrence, including fragments on another line.
   for(const slot of Array.from(group.children) as HTMLElement[])slot.style.visibility=fitted?'visible':'hidden';
   if(fitted)masked.push(record.range);else full.push(record.range);
   group.dataset.semanticFit=fitted?'inline':'full';
  }
  if(colored){const mask=new cssWin!.Highlight!(...masked);mask.priority=10;cssWin!.CSS!.highlights!.set(name,mask);const overflow=new cssWin!.Highlight!(...full);overflow.priority=9;cssWin!.CSS!.highlights!.set(name+'-full',overflow);}
 }
 const schedule=()=>{if(disposed||raf)return;raf=win?.requestAnimationFrame(()=>{raf=0;paint();})??0;};
 const resize=win&&'ResizeObserver' in win?new win.ResizeObserver(schedule):null;resize?.observe(root);
 const observer=win?new win.MutationObserver(changes=>{if(changes.some(c=>!(c.target instanceof win.Element)||!c.target.closest('[data-reader-projection-overlay]')))schedule();}):null;
 observer?.observe(root,{attributes:true,subtree:true,attributeFilter:['style','class']});
 const parentDoc=win?.frameElement?.ownerDocument;parentDoc?.addEventListener('scroll',schedule,true);parentDoc?.defaultView?.addEventListener('resize',schedule);
 win?.addEventListener('resize',schedule);doc.addEventListener('scroll',schedule,true);doc.fonts?.addEventListener('loadingdone',schedule);
 function stopTimer(id:string){clearTimeout(timers.get(id));timers.delete(id);}
 return {
  pending(change:{id:string;range:Range}){
   stopTimer(change.id);returning.delete(change.id);const record={...change,replacement:change.range.toString()};waiting.set(change.id,record);paint();
   return()=>{if(waiting.get(change.id)===record){waiting.delete(change.id);paint();}};
  },
  restore(id:string,animate=false){
   const record=records.find(r=>r.id===id);if(!animate||!record)return;
   stopTimer(id);completedMotion.delete(id);returning.set(id,{...record,replacement:record.range.toString()});
   timers.set(id,setTimeout(()=>{returning.delete(id);timers.delete(id);paint();},160));
  },
  set(changes:DisplayChange[]){
   for(const r of changes){returning.delete(r.id);if(waiting.has(r.id)){waiting.delete(r.id);completedMotion.add(r.id);}}
   const ids=new Set(changes.map(r=>r.id));for(const id of completedMotion)if(!ids.has(id))completedMotion.delete(id);records=changes;paint();
  },
  refresh:schedule,
  dispose(){if(disposed)return;disposed=true;if(raf)win?.cancelAnimationFrame(raf);resize?.disconnect();observer?.disconnect();win?.removeEventListener('resize',schedule);doc.removeEventListener('scroll',schedule,true);doc.fonts?.removeEventListener('loadingdone',schedule);parentDoc?.removeEventListener('scroll',schedule,true);parentDoc?.defaultView?.removeEventListener('resize',schedule);cssWin?.CSS?.highlights?.delete(name);cssWin?.CSS?.highlights?.delete(name+'-full');layer.remove();style.remove();for(const timer of timers.values())clearTimeout(timer);timers.clear();waiting.clear();returning.clear();groups.clear();completedMotion.clear();records=[];},
 };
}
