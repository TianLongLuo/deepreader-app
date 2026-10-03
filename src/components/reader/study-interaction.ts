import {collectMeaningSources,sourceRange} from './meaning-text-source';
import {projectionFor,projectedRanges} from './original-text';
export type StudyLanguage = 'en' | 'es' | 'bilingual';
export function getStudyLanguage(source: 'en'|'es', preferences: Partial<Record<'en'|'es', unknown>>): StudyLanguage {
 const value = preferences[source];
 return value === 'bilingual' || value === 'en' || (source === 'es' && value === 'es') ? value : 'en';
}
export function oppositeSide(x: number, left: number, width: number): 'left'|'right' { return x > left + width / 2 ? 'left' : 'right'; }
export function wordSpanAtOffset(text: string, offset: number) {
 for (const match of text.matchAll(/[\p{L}\p{M}]+(?:['’\-][\p{L}\p{M}]+)*/gu)) {
  const start=match.index!,end=start+match[0].length;
  if(offset>=start&&offset<end)return {start,end,word:match[0]};
 }
 return null;
}
export function wordAtPoint(doc: Document, x: number, y: number, within: Element) {
 const caretDoc=doc as Document & {caretPositionFromPoint?:(x:number,y:number)=>{offsetNode:Node;offset:number}|null;caretRangeFromPoint?:(x:number,y:number)=>Range|null};
 const pos=caretDoc.caretPositionFromPoint?.(x,y);
 const caret=pos?null:caretDoc.caretRangeFromPoint?.(x,y);
 const node=pos?.offsetNode??caret?.startContainer;
 let offset=pos?.offset??caret?.startOffset;
 if(!node||node.nodeType!==3||offset===undefined||!within.contains(node))return null;
 const point=projectionFor(node)?.originalPoint({node,offset},'before')??{node,offset};
 for(const source of collectMeaningSources(within)){
  let index=source.points.findIndex(p=>p.node===point.node&&p.offset===point.offset);
  if(index<0){const end=source.ends.findIndex(p=>p.node===point.node&&p.offset===point.offset);if(end>=0)index=end+1;}
  if(index<0)continue;
  // Caret APIs return the nearest insertion point; geometry still must contain the click.
  const hit=wordSpanAtOffset(source.text,index)||wordSpanAtOffset(source.text,index-1);if(!hit)continue;
  const originalRange=sourceRange(source,hit.start,hit.end),ranges=projectedRanges(originalRange);
  for(const range of ranges){const rect=Array.from(range.getClientRects()).find(r=>x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom);if(rect)return {...hit,source,originalRange,range,rect};}
 }
 return null;
}
export function highlightWord(doc: Document, range?: Range) {
 const win=doc.defaultView as (Window & {CSS?:{highlights?:Map<string,unknown>};Highlight?:new (...ranges:Range[])=>unknown})|null;
 const highlights=win?.CSS?.highlights;
 if(!highlights)return;
 if(range&&win?.Highlight) highlights.set('reader-hover-word',new win.Highlight(range));
 else highlights.delete('reader-hover-word');
}
