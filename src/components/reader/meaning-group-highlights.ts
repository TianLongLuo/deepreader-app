import type {MeaningGroupResult,MeaningSpan} from '@/lib/meaning-groups';
type Point={node:Text;offset:number};
type HighlightLike={priority:number};
type HighlightWindow=Window&{CSS?:{highlights?:Map<string,unknown>};Highlight?:new(...ranges:Range[])=>HighlightLike};
const names=['reader-meaning-0','reader-meaning-1','reader-meaning-2','reader-meaning-verb'];
const selector='[data-reader-interactive="true"], [data-pdf-selection-key]';
export function meaningParagraphElements(root:Element){return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(element=>!element.querySelector(selector));}
export function sameMeaningElements(a:HTMLElement[],b:HTMLElement[]){return a.length===b.length&&a.every((element,i)=>element===b[i]);}
export const supportsMeaningHighlights=(doc:Document)=>Boolean((doc.defaultView as HighlightWindow|null)?.CSS?.highlights&&(doc.defaultView as HighlightWindow|null)?.Highlight);
/** Range mapping never wraps/splits text nodes, so EPUB CFIs and copy remain unchanged. */
export function meaningRanges(element:HTMLElement,result:MeaningGroupResult){
 const doc=element.ownerDocument,walker=doc.createTreeWalker(element,4);
 const starts:Point[]=[],ends:Point[]=[];let text='',pending=false,node:Node|null;
 while((node=walker.nextNode())){
  const current=node as Text,value=current.data;
  for(let offset=0;offset<value.length;offset++){
   if(/\s/.test(value[offset])){if(text)pending=true;continue;}
   if(pending){text+=' ';starts.push(ends[ends.length-1]);ends.push({node:current,offset});pending=false;}
   text+=value[offset];starts.push({node:current,offset});ends.push({node:current,offset:offset+1});
  }
 }
 if(text!==result.text)return null;
 const range=(span:MeaningSpan)=>{const start=starts[span.start],end=ends[span.end-1];if(!start||!end)return null;const r=doc.createRange();r.setStart(start.node,start.offset);r.setEnd(end.node,end.offset);return r;};
 return {groups:result.groups.map(range),verbs:result.verbs.map(range)};
}
export function paintMeaningHighlights(doc:Document,entries:Array<{element:HTMLElement;result:MeaningGroupResult}>,theme:'light'|'dark'|'sepia'){
 const win=doc.defaultView as HighlightWindow|null;if(!supportsMeaningHighlights(doc)||!win?.Highlight||!win.CSS?.highlights)return;
 const buckets:Range[][]=[[],[],[],[]];
 for(const entry of entries){const mapped=meaningRanges(entry.element,entry.result);if(!mapped)continue;mapped.groups.forEach((r,i)=>{if(r)buckets[i%3].push(r);});mapped.verbs.forEach(r=>{if(r)buckets[3].push(r);});}
 let style=doc.querySelector<HTMLStyleElement>('style[data-reader-meaning-style]');
 if(!style){style=doc.createElement('style');style.dataset.readerMeaningStyle='true';doc.head.appendChild(style);}
 const colors=theme==='dark'?['rgba(139,179,167,.20)','rgba(230,196,117,.20)','rgba(199,143,154,.20)']:['rgba(163,195,177,.28)','rgba(232,205,136,.32)','rgba(222,177,184,.28)'];
 const css=colors.map((color,i)=>`::highlight(${names[i]}){background-color:${color};}`).join('')+`::highlight(reader-meaning-verb){color:${theme==='dark'?'#f4cd8d':'#894b26'};}`;
 if(style.textContent!==css)style.textContent=css;
 names.forEach((name,i)=>{if(!buckets[i].length){win.CSS!.highlights!.delete(name);return;}const h=new win.Highlight!(...buckets[i]);h.priority=i===3?-5:-10;win.CSS!.highlights!.set(name,h);});
}
export function clearMeaningHighlights(doc:Document){const win=doc.defaultView as HighlightWindow|null;for(const name of names)win?.CSS?.highlights?.delete(name);doc.querySelector('style[data-reader-meaning-style]')?.remove();}
