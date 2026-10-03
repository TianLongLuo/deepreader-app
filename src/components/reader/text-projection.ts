import {createStableFlipLayer} from './stable-flip-layer';
import {createOffsetProjection,type EndpointBias} from './projection-offsets';
export type OriginalEndpoint=Readonly<{node:Node;offset:number}>;
export interface OriginalTextAccess {
 originalText(value:Node|Range):string;
 originalRange(liveRange:Range,bias?:{start:EndpointBias;end:EndpointBias}):Range;
 projectedRanges(originalRange:Range):readonly Range[];
 canonicalNode(liveNode:Node):Node|null;
 liveNode(canonicalNode:Node):Node|null;
 originalPoint(point:OriginalEndpoint,bias:EndpointBias):OriginalEndpoint;
}
export interface TextProjection extends OriginalTextAccess {
 readonly liveRoot:Element;readonly liveDocument:Document;readonly canonicalDocument:Document;readonly epoch:number;
 apply(change:{id:string;originalRange:Range;replacement:string}):void;
 pending(change:{id:string;originalRange:Range}):()=>void;
 restore(id:string,options?:{animate?:boolean}):void;restoreAll():void;occurrenceForLiveRange(range:Range):string|null;
 subscribe(listener:(epoch:number)=>void):()=>void;dispose():void;
}
const isRange=(value:Node|Range):value is Range=>'startContainer' in value;
type TextPair={live:Text;canonical:Text;start:number;end:number};

/** Immutable source snapshot. Display edits preserve every original child and Text identity. */
export function createTextProjection(liveRoot:Element,options:{layout?:'stable'|'reflow'}={}):TextProjection {
 const liveDocument=liveRoot.ownerDocument;
 const canonicalDocument=liveDocument.implementation.createHTMLDocument('');
 const liveToCanonical=new WeakMap<Node,Node>(),canonicalToLive=new WeakMap<Node,Node>();
 let canonicalRoot:Element;
 if(liveRoot===liveDocument.documentElement||liveRoot===liveDocument.body){
  canonicalDocument.replaceChild(canonicalDocument.importNode(liveDocument.documentElement,true),canonicalDocument.documentElement);
  canonicalRoot=liveRoot===liveDocument.documentElement?canonicalDocument.documentElement:canonicalDocument.body;
 }else{
  canonicalRoot=canonicalDocument.importNode(liveRoot,true);
  canonicalDocument.body.appendChild(canonicalRoot);
 }
 const pairs:TextPair[]=[];let original='',epoch=0,disposed=false;
 const listeners=new Set<(epoch:number)=>void>();
 function pair(live:Node,canonical:Node){
  liveToCanonical.set(live,canonical);canonicalToLive.set(canonical,live);
  if(live.nodeType===3&&(liveRoot!==liveDocument.documentElement||liveDocument.body.contains(live))){
   const text=(canonical as Text).data,start=original.length;original+=text;
   pairs.push({live:live as Text,canonical:canonical as Text,start,end:original.length});
  }
  Array.from(live.childNodes).forEach((n,i)=>pair(n,canonical.childNodes[i]));
 }
 pair(liveRoot,canonicalRoot);
 const offsets=createOffsetProjection(original);
 const stable=options.layout==='stable';
 const layer=stable?createStableFlipLayer(liveRoot):null;
 const displayOffset=(offset:number,bias:EndpointBias)=>stable?offset:offsets.toDisplay(offset,bias);
 function assertOwned(node:Node,canonical:boolean){
  const root=canonical?canonicalRoot:liveRoot;
  if(node!==root&&!root.contains(node))throw new RangeError('Range is outside its source projection');
 }
 function rawOffset(point:OriginalEndpoint,canonical:boolean){
  const doc=canonical?canonicalDocument:liveDocument,root=canonical?canonicalRoot:liveRoot;
  assertOwned(point.node,canonical);
  const prefix=doc.createRange();prefix.selectNodeContents(root);prefix.setEnd(point.node,point.offset);
  // EPUB themes/highlight rules add head Text after capture; only paired body fragments count.
  let length=0;
  for(const p of pairs){const node=canonical?p.canonical:p.live;if(node===point.node)return length+point.offset;if(prefix.comparePoint(node,node.length)!==1)length+=node.length;}
  return length;
 }
 function pointAt(offset:number,canonical:boolean,bias:EndpointBias):OriginalEndpoint {
  let cursor=0;
  for(const p of pairs){
   const node=canonical?p.canonical:p.live,length=node.data.length;
   if(offset<cursor+length||(offset===cursor+length&&bias==='before'))return {node,offset:offset-cursor};
   cursor+=length;
  }
  const last=pairs.at(-1);
  return last?{node:canonical?last.canonical:last.live,offset:(canonical?last.canonical:last.live).length}:{node:canonical?canonicalRoot:liveRoot,offset:0};
 }
 function originalPoint(point:OriginalEndpoint,bias:EndpointBias):OriginalEndpoint {
  if(point.node.ownerDocument===canonicalDocument){assertOwned(point.node,true);return point;}
  assertOwned(point.node,false);
  // Element child offsets are structural and remain exact; Text offsets can span an atom.
  const paired=liveToCanonical.get(point.node);
  if(point.node.nodeType!==3&&paired)return {node:paired,offset:Array.from(point.node.childNodes).slice(0,point.offset).filter(n=>liveToCanonical.has(n)).length};
  const offset=stable?rawOffset(point,false):offsets.toOriginal(rawOffset(point,false),bias),pair=pairs.find(p=>p.live===point.node);
  // Preserve an exact node-boundary identity instead of choosing the preceding block.
  if(pair&&offset>=pair.start&&offset<=pair.end)return {node:pair.canonical,offset:offset-pair.start};
  return pointAt(offset,true,bias);
 }
 function originalRange(range:Range,bias={start:'before' as EndpointBias,end:'after' as EndpointBias}){
  if(range.startContainer.ownerDocument===canonicalDocument){assertOwned(range.startContainer,true);assertOwned(range.endContainer,true);return range.cloneRange();}
  const first=originalPoint({node:range.startContainer,offset:range.startOffset},bias.start);
  const last=originalPoint({node:range.endContainer,offset:range.endOffset},bias.end);
  const r=canonicalDocument.createRange();r.setStart(first.node,first.offset);r.setEnd(last.node,last.offset);return r;
 }
 function originalBounds(range:Range){
  const r=originalRange(range);
  return {start:rawOffset({node:r.startContainer,offset:r.startOffset},true),end:rawOffset({node:r.endContainer,offset:r.endOffset},true)};
 }
 function projectedRanges(range:Range):readonly Range[]{
  const canonical=originalRange(range);
  if(canonical.collapsed&&canonical.startContainer.nodeType!==3){
   const live=canonicalToLive.get(canonical.startContainer);
   if(live){const r=liveDocument.createRange();r.setStart(live,canonical.startOffset);r.collapse(true);return [r];}
  }
  const {start,end}=originalBounds(range);
  const a=pointAt(displayOffset(start,'before'),false,'after');
  let first=a;
  // A source caret has one endpoint. Opposite boundary biases otherwise move its
  // end into the preceding block, and Range.setEnd silently collapses it there.
  if(range.collapsed){
   const canonical=originalRange(range),owner=pairs.find(p=>p.canonical===canonical.startContainer),display=displayOffset(start,'before');
   if(owner){const prefix=pairs.slice(0,pairs.indexOf(owner)).reduce((sum,p)=>sum+p.live.length,0);if(display>=prefix&&display<=prefix+owner.live.length)first={node:owner.live,offset:display-prefix};}
  }
  const b=range.collapsed?first:pointAt(displayOffset(end,'after'),false,'before');
  const r=liveDocument.createRange();r.setStart(first.node,first.offset);r.setEnd(b.node,b.offset);return [r];
 }
 function render(){
  // Build all new fragments first; there is no partially applied cross-inline occurrence.
  const changes=offsets.changes();
  if(layer){
   layer.set(changes.map(c=>{const a=pointAt(c.start,false,'after'),b=pointAt(c.end,false,'before'),range=liveDocument.createRange();range.setStart(a.node,a.offset);range.setEnd(b.node,b.offset);return {id:c.id,range,replacement:c.replacement};}));
   epoch++;for(const notify of listeners)notify(epoch);return;
  }
  const strings=pairs.map(p=>{
   let cursor=p.start,value='';
   for(const c of changes){
    if(c.end<=p.start||c.start>=p.end)continue;
    const start=Math.max(c.start,p.start),end=Math.min(c.end,p.end);
    value+=original.slice(cursor,start);
    if(c.start>=p.start)value+=c.replacement;
    cursor=end;
   }
   return value+original.slice(cursor,p.end);
  });
  pairs.forEach((p,i)=>{if(p.live.data!==strings[i])p.live.data=strings[i];});
  epoch++;for(const notify of listeners)notify(epoch);
 }
 return {
  liveRoot,liveDocument,canonicalDocument,get epoch(){return epoch;},
  canonicalNode:node=>node.ownerDocument===canonicalDocument?node:liveToCanonical.get(node)??null,
  liveNode:node=>node.ownerDocument===liveDocument?node:canonicalToLive.get(node)??null,
  originalPoint,originalRange,projectedRanges,
  originalText(value){
   if(isRange(value))return originalRange(value).toString();
   const canonical=value.ownerDocument===canonicalDocument?value:liveToCanonical.get(value);
   if(!canonical)throw new RangeError('Node is outside its source projection');
   return canonical.textContent??'';
  },
  apply({id,originalRange:range,replacement}){
   if(disposed)throw new Error('Projection disposed');
   const {start,end}=originalBounds(range);offsets.apply({id,start,end,replacement});render();
  },
  pending({id,originalRange:range}){if(disposed||!layer)return()=>{};return layer.pending({id,range:projectedRanges(range)[0]});},
  restore(id,options){if(!disposed&&offsets.changes().some(c=>c.id===id)){layer?.restore(id,options?.animate);offsets.restore(id);render();}},
  restoreAll(){if(!disposed&&offsets.changes().length){offsets.restoreAll();render();}},
  occurrenceForLiveRange(range){
   if(range.startContainer.ownerDocument!==liveDocument)return null;
   const a=rawOffset({node:range.startContainer,offset:range.startOffset},false),b=rawOffset({node:range.endContainer,offset:range.endOffset},false);
   const c=stable?offsets.changes().find(c=>a>=c.start&&a<c.end):offsets.at(a);if(!c)return null;
   const end=displayOffset(c.end,'after');return b<=end?c.id:null;
  },
  subscribe(listener){if(disposed)return ()=>{};listeners.add(listener);return ()=>{listeners.delete(listener);};},
  dispose(){if(disposed)return;offsets.restoreAll();render();layer?.dispose();listeners.clear();disposed=true;},
 };
}
