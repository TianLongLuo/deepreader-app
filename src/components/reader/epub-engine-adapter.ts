import {syncReadingScroll,updateReadingBuffer,type ContinuousManagerPort,type ReadingWindowGeometry} from './reading-flow';
export type LoadedViewPort={document:Document;contents:{resizeCheck():void};layout:{format(contents:unknown):unknown};expand():void;width():number;height():number};
export type EpubReflowPort={dispose?():void;views():readonly LoadedViewPort[];manager:ContinuousManagerPort;geometry():ReadingWindowGeometry|null;display(cfi:string):Promise<unknown>;alignAnchor?(cfi:string):void;reportLocation():unknown;nextFrame():Promise<void>};
function wait<T>(operation:PromiseLike<T>|T,signal:AbortSignal):Promise<T>{
 return new Promise((resolve,reject)=>{
  if(signal.aborted){reject(signal.reason);return;}
  const canceled=()=>reject(signal.reason);signal.addEventListener('abort',canceled,{once:true});
  Promise.resolve(operation).then(resolve,reject).finally(()=>signal.removeEventListener('abort',canceled));
 });
}
async function bounded<T>(signal:AbortSignal,run:(local:AbortSignal)=>Promise<T>):Promise<T>{
 const local=new AbortController(),cancel=()=>local.abort(signal.reason);
 if(signal.aborted)cancel();else signal.addEventListener('abort',cancel,{once:true});
 const timer=setTimeout(()=>local.abort(new Error('EPUB geometry timed out')),5000);
 try{return await wait(run(local.signal),local.signal);}finally{clearTimeout(timer);signal.removeEventListener('abort',cancel);}
}
/** Explicit formatting/expansion is required: a root ResizeObserver cannot prove column-tail reachability. */
export async function settleEpubGeometry(port:EpubReflowPort,signal:AbortSignal,anchor?:string):Promise<void>{
 return bounded(signal,async local=>{
  const formatted=new WeakSet<LoadedViewPort>();
  const formatNew=async()=>{if(port.manager.enqueue)await wait(port.manager.enqueue(async()=>{}),local);for(const view of port.views()){if(formatted.has(view))continue;local.throwIfAborted();await wait(view.layout.format(view.contents),local);view.contents.resizeCheck();view.expand();formatted.add(view);}if(anchor)port.alignAnchor?.(anchor);syncReadingScroll(port.manager);};
  await formatNew();let geometry=port.geometry();if(!geometry)throw new Error('EPUB has no visible geometry');
  await wait(updateReadingBuffer(port.manager,geometry),local);
  let previous='',stable=0;
  while(stable<2){
   await wait(port.nextFrame(),local);await formatNew();geometry=port.geometry();if(!geometry)throw new Error('EPUB has no visible geometry');
   const views=port.views(),sizes=views.map(v=>[v.width(),v.height()]);
   const snapshot=JSON.stringify([geometry,sizes,port.manager.scrollTop,port.manager.scrollLeft]);
   const positive=views.length>0&&sizes.every(size=>size.every(n=>Number.isFinite(n)&&n>0));
   stable=positive&&snapshot===previous?stable+1:0;previous=snapshot;
  }
  // reportLocation/updateLayout can overwrite offset; retain two real screens after settling.
  port.manager.settings.offset=geometry.buffer;
 });
}
export async function reflowAtCanonicalAnchor(port:EpubReflowPort,anchor:string,signal:AbortSignal):Promise<void>{
 await settleEpubGeometry(port,signal,anchor);
 await bounded(signal,local=>wait(port.display(anchor),local));
 port.alignAnchor?.(anchor);await settleEpubGeometry(port,signal,anchor);
 port.alignAnchor?.(anchor);await settleEpubGeometry(port,signal,anchor);signal.throwIfAborted();await wait(port.reportLocation(),signal);
 const geometry=port.geometry();if(geometry)port.manager.settings.offset=geometry.buffer;
}
/** A pinned IframeView can keep its identity while recycling its document/Contents. */
export function mapLoadedView<T extends {contents:LoadedViewPort['contents']&{document:Document};layout:LoadedViewPort['layout'];expand():void;width():number;height():number}>(cache:WeakMap<T,LoadedViewPort>,view:T):LoadedViewPort{
 let mapped=cache.get(view);
 if(!mapped||mapped.document!==view.contents.document||mapped.contents!==view.contents||mapped.layout!==view.layout){mapped={document:view.contents.document,contents:view.contents,layout:view.layout,expand:()=>view.expand(),width:()=>view.width(),height:()=>view.height()};cache.set(view,mapped);}return mapped;
}
