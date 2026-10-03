import type {TextProjection} from './text-projection';
const roots=new WeakMap<Node,{projection:TextProjection;refs:number}>();
/** Multiple independent PDF roots can share a live Document. */
export function registerOriginalText(projection:TextProjection):()=>void{
 const canonical=projection.canonicalNode(projection.liveRoot)!;
 for(const root of [projection.liveRoot,canonical]){
  const old=roots.get(root);if(old&&old.projection!==projection)throw new Error('Source root already registered');
  roots.set(root,{projection,refs:(old?.refs??0)+1});
 }
 let released=false;return ()=>{if(released)return;released=true;for(const root of [projection.liveRoot,canonical]){const entry=roots.get(root);if(!entry)continue;if(--entry.refs===0)roots.delete(root);}};
}
export function projectionFor(node:Node):TextProjection|undefined{
 for(let current:Node|null=node;current;current=current.parentNode){const entry=roots.get(current);if(entry)return entry.projection;}
 return undefined;
}
export function originalRange(range:Range):Range{
 const p=projectionFor(range.startContainer);
 return p&&p===projectionFor(range.endContainer)?p.originalRange(range):range.cloneRange();
}
export function projectedRanges(range:Range):readonly Range[]{
 const p=projectionFor(range.startContainer);
 return p&&p===projectionFor(range.endContainer)?p.projectedRanges(range):[range.cloneRange()];
}
export function originalText(value:Node|Range):string{
 if('startContainer' in value)return readOriginalSelection(value);
 const p=projectionFor(value);if(p)return p.originalText(value);
 if(value.nodeType===3)return value.textContent??'';
 const walker=(value.ownerDocument??value as Document).createTreeWalker(value,4);let text='',node:Node|null;
 while((node=walker.nextNode()))text+=projectionFor(node)?.originalText(node)??node.textContent??'';
 return text;
}
const blocks='p,div,li,blockquote,h1,h2,h3,h4,h5,h6,pre,td,th,[data-pdf-selection-key]';
/** Copy original fragments, retaining explicit BR and block boundaries across PDF roots. */
export function readOriginalSelection(range:Range):string{
 const doc=range.startContainer.ownerDocument!,paired=Boolean(projectionFor(range.startContainer)&&projectionFor(range.endContainer));
 let root=range.commonAncestorContainer;if(root.nodeType===3){return originalRange(range).toString();}
 const walker=doc.createTreeWalker(root,1|4);let node:Node|null,text='',lastBlock:Element|null=null;
 while((node=walker.nextNode())){
  if(!range.intersectsNode(node)||(paired&&!projectionFor(node)))continue;
  if(node.nodeType===1){if((node as Element).tagName.toUpperCase()==='BR'&&text&&!text.endsWith('\n'))text+='\n';continue;}
  const n=node as Text;if(!n.length)continue;
  const start=n===range.startContainer?range.startOffset:0,end=n===range.endContainer?range.endOffset:n.length;
  if(end<=start)continue;
  const fragment=doc.createRange();fragment.setStart(n,start);fragment.setEnd(n,end);
  const part=originalRange(fragment).toString();if(!part)continue;
  const block=n.parentElement?.closest(blocks)??null;
  if(lastBlock&&block!==lastBlock&&text&&!text.endsWith('\n'))text+='\n';
  text+=part;lastBlock=block;
 }
 return text;
}
