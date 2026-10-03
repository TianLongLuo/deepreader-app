import type {EpubCFI} from 'epubjs';
import type {TextProjection} from './text-projection';
export interface CanonicalCfiScope {
 register(projection:TextProjection):()=>void;
 cloneOriginRange(range:Range):Range;
 diagnostics():{registeredFromRange:number;registeredToRange:number};
 dispose():void;
}
type CfiConstructor=typeof EpubCFI;
type ScopeStats={registeredFromRange:number;registeredToRange:number};
type Entry={projection:TextProjection;owners:Map<ScopeStats,number>};
type Origin={canonical:Range;start:Node;startOffset:number;end:Node;endOffset:number};
type State={refs:number;entries:Map<Document,Entry>;origins:WeakMap<Range,Origin>;
 fromRange:CfiConstructor['prototype']['fromRange'];fromNode:CfiConstructor['prototype']['fromNode'];toRange:CfiConstructor['prototype']['toRange']};
const states=new WeakMap<CfiConstructor,State>();
function matchingOrigin(state:State,range:Range){
 const o=state.origins.get(range);
 return o&&o.start===range.startContainer&&o.startOffset===range.startOffset&&o.end===range.endContainer&&o.endOffset===range.endOffset?o:undefined;
}
function annotate(state:State,live:Range,canonical:Range){
 state.origins.set(live,{canonical:canonical.cloneRange(),start:live.startContainer,startOffset:live.startOffset,end:live.endContainer,endOffset:live.endOffset});
}
/** Patches exactly the constructor used by the current EPUB runtime; scope is per Document. */
export function createCanonicalCfiScope(Cfi:CfiConstructor):CanonicalCfiScope {
 let state=states.get(Cfi);
 if(!state){
  const installed:State={refs:0,entries:new Map(),origins:new WeakMap(),fromRange:Cfi.prototype.fromRange,fromNode:Cfi.prototype.fromNode,toRange:Cfi.prototype.toRange};
  state=installed;states.set(Cfi,installed);
  Cfi.prototype.fromRange=function(range,base,ignoreClass){
   const entry=installed.entries.get(range.startContainer.ownerDocument!);
   if(!entry)return installed.fromRange.call(this,range,base,ignoreClass);
   for(const stats of entry.owners.keys())stats.registeredFromRange++;
   const origin=matchingOrigin(installed,range);
   return installed.fromRange.call(this,origin?.canonical??entry.projection.originalRange(range),base,ignoreClass);
  };
  Cfi.prototype.fromNode=function(node,base,ignoreClass){
   const entry=installed.entries.get(node.ownerDocument!);
   return installed.fromNode.call(this,entry?.projection.canonicalNode(node)??node,base,ignoreClass);
  };
  Cfi.prototype.toRange=function(doc,ignoreClass){
   const entry=doc?installed.entries.get(doc):undefined;
   if(!entry)return installed.toRange.call(this,doc,ignoreClass);
   for(const stats of entry.owners.keys())stats.registeredToRange++;
   const canonical=installed.toRange.call(this,entry.projection.canonicalDocument,ignoreClass);
   const live=entry.projection.projectedRanges(canonical)[0];
   annotate(installed,live,canonical);return live;
  };
 }
 const shared=state;shared.refs++;
 const stats:ScopeStats={registeredFromRange:0,registeredToRange:0};
 const cleanups=new Set<()=>void>();let disposed=false;
 return {
  register(projection){
   if(disposed)throw new Error('CFI scope disposed');
   const doc=projection.liveDocument;let entry=shared.entries.get(doc);
   if(entry&&entry.projection!==projection)throw new Error('Document already has another source projection');
   if(!entry){entry={projection,owners:new Map()};shared.entries.set(doc,entry);}
   const registered=entry;registered.owners.set(stats,(registered.owners.get(stats)??0)+1);
   let released=false;
   const off=()=>{
    if(released)return;released=true;cleanups.delete(off);
    const count=registered.owners.get(stats)??0;
    if(count>1)registered.owners.set(stats,count-1);else registered.owners.delete(stats);
    if(registered.owners.size===0&&shared.entries.get(doc)===registered)shared.entries.delete(doc);
   };
   cleanups.add(off);return off;
  },
  cloneOriginRange(range){const clone=range.cloneRange(),origin=matchingOrigin(shared,range);if(origin)annotate(shared,clone,origin.canonical);return clone;},
  diagnostics:()=>({...stats}),
  dispose(){
   if(disposed)return;disposed=true;for(const off of [...cleanups])off();shared.refs--;
   if(shared.refs===0){Cfi.prototype.fromRange=shared.fromRange;Cfi.prototype.fromNode=shared.fromNode;Cfi.prototype.toRange=shared.toRange;states.delete(Cfi);}
  },
 };
}
