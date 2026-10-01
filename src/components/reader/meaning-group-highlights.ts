import {meaningPalette} from '@/lib/meaning-theme';
import type {MeaningGroupResult} from '@/lib/meaning-groups';
import {sourceRange,type MeaningTextSource} from './meaning-text-source';
import {offsetMeaningResult} from '@/lib/meaning-group-units';
type HighlightLike={priority:number};
type HighlightWindow=Window&{CSS?:{highlights?:Map<string,unknown>};Highlight?:new(...ranges:Range[])=>HighlightLike};
const names=['reader-meaning-0','reader-meaning-1','reader-meaning-2','reader-meaning-verb'];
export function sameMeaningElements(a:HTMLElement[],b:HTMLElement[]){return a.length===b.length&&a.every((element,i)=>element===b[i]);}
export const supportsMeaningHighlights=(doc:Document)=>Boolean((doc.defaultView as HighlightWindow|null)?.CSS?.highlights&&(doc.defaultView as HighlightWindow|null)?.Highlight);
/** Range mapping never wraps/splits text nodes, so EPUB CFIs and copy remain unchanged. */
export function meaningRanges(source:MeaningTextSource,result:MeaningGroupResult,offset=0){
 if(source.text.slice(offset,offset+result.text.length)!==result.text)return null;
 const mapped=offsetMeaningResult(result,offset);
 return {groups:mapped.groups.map(span=>sourceRange(source,span.start,span.end)),verbs:mapped.verbs.map(span=>sourceRange(source,span.start,span.end))};
}
export function paintMeaningHighlights(doc:Document,entries:Array<{source:MeaningTextSource;result:MeaningGroupResult;offset:number}>,theme:'light'|'dark'|'sepia',lowSaturation=false){
 const win=doc.defaultView as HighlightWindow|null;if(!supportsMeaningHighlights(doc)||!win?.Highlight||!win.CSS?.highlights)return;
 const buckets:Range[][]=[[],[],[],[]];
 for(const entry of entries){const mapped=meaningRanges(entry.source,entry.result,entry.offset);if(!mapped)continue;mapped.groups.forEach((r,i)=>buckets[i%3].push(r));mapped.verbs.forEach(r=>buckets[3].push(r));}
 let style=doc.querySelector<HTMLStyleElement>('style[data-reader-meaning-style]');
 if(!style){style=doc.createElement('style');style.dataset.readerMeaningStyle='true';doc.head.appendChild(style);}
 const palette=meaningPalette(theme,lowSaturation);
 const css=palette.backgrounds.map((color,i)=>`::highlight(${names[i]}){background-color:${color};color:${palette.foreground};}`).join('')+`::highlight(reader-meaning-verb){color:${palette.verb};}`;
 if(style.textContent!==css)style.textContent=css;
 names.forEach((name,i)=>{if(!buckets[i].length){win.CSS!.highlights!.delete(name);return;}const h=new win.Highlight!(...buckets[i]);h.priority=i===3?-5:-10;win.CSS!.highlights!.set(name,h);});
}
export function clearMeaningHighlights(doc:Document){const win=doc.defaultView as HighlightWindow|null;for(const name of names)win?.CSS?.highlights?.delete(name);doc.querySelector('style[data-reader-meaning-style]')?.remove();}
