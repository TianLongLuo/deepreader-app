import {EpubCFI} from 'epubjs';
import {createCanonicalCfiScope} from './scoped-cfi-adapter';
import {createTextProjection,type TextProjection} from './text-projection';
import {registerOriginalText} from './original-text';
import {reflowAtCanonicalAnchor,type EpubReflowPort} from './epub-engine-adapter';
import type {createReadingRestoreController,RestoreReason} from './reading-restore';
import type {ReadingProgressSnapshot} from './progress-sync';
export type SessionContents={document:Document;window:Window;cfiFromRange:(range:Range)=>string;cfiFromNode:(node:Node)=>string;addStylesheetCss:(css:string,key:string)=>void};
export type SessionRuntime={port:EpubReflowPort;ready():Promise<unknown>;on(name:string,fn:(value:unknown)=>void):void;off(name:string,fn:(value:unknown)=>void):void;
 content:{register(fn:(contents:SessionContents)=>void|Promise<void>):void;deregister(fn:(contents:SessionContents)=>void|Promise<void>):void};percentage(cfi:string):number;anchorForTarget?:(target:string)=>string|null};
/** Only source-safe transactions may confirm progress; every owned event is detached on rebuild. */
export function createEpubReadingSession(input:{runtime:SessionRuntime;restore:ReturnType<typeof createReadingRestoreController>;onPhase:()=>void;onProgress:(snapshot:ReadingProgressSnapshot)=>void;onContents:(contents:SessionContents)=>()=>void;onScroll:()=>void}){
 const {runtime,restore}=input,scope=createCanonicalCfiScope(EpubCFI),cleanup:Array<()=>void>=[],contents=new Map<Document,{contents:SessionContents;off:()=>void}>(),projections=new Map<Document,{projection:TextProjection;off:()=>void}>();
 let disposed=false,transaction:AbortController|null=null,gen=restore.generation(),rendered=false,lastRange:{start:string;end:string}|null=null,locationVersion=0,projectionEnabled=false,scroller:HTMLElement|undefined;
 let rebinding=0;const lifetime=new AbortController();
 let rebind:((signal:AbortSignal)=>Promise<void>)|undefined;
 const active=()=>!disposed;
 function listen(name:string,fn:(value:unknown)=>void){runtime.on(name,fn);cleanup.push(()=>runtime.off(name,fn));}
 function prune(){const loaded=new Set(runtime.port.views().map(v=>v.document));for(const [doc,entry] of contents){const frame=entry.contents.window.frameElement;if(!loaded.has(doc)||!frame?.isConnected){entry.off();contents.delete(doc);const p=projections.get(doc);p?.off();projections.delete(doc);}}}
 function ensureProjection(content:SessionContents){
  const old=projections.get(content.document);if(old)return old.projection;
  const projection=createTextProjection(content.document.documentElement,{layout:'stable'}),offOriginal=registerOriginalText(projection),offCfi=scope.register(projection);
  projections.set(content.document,{projection,off:()=>{offCfi();offOriginal();projection.dispose();}});return projection;
 }
 const onContent=async(content:SessionContents)=>{
  if(!active())return;const doc=content.document;if(contents.has(doc))return;
  if(projectionEnabled)ensureProjection(content);
  contents.set(doc,{contents:content,off:input.onContents(content)});
  if(projectionEnabled&&rebind){
   rebinding++;input.onPhase();const before=projections.get(doc)?.projection.epoch;
   try{
    await rebind(lifetime.signal);lifetime.signal.throwIfAborted();
    // Ordinary native navigation does not enter restoreTo. Reapply before the
    // content hook resolves/rendered emits, then correct this new view's size.
    if(projections.get(doc)?.projection.epoch!==before){
     const view=runtime.port.views().find(v=>v.document===doc);
     if(view){await view.layout.format(view.contents);view.contents.resizeCheck();view.expand();await runtime.port.nextFrame();}
    }
   }catch(error){if(active()){restore.fail(gen,error);input.onPhase();}}
   finally{rebinding--;if(active())input.onPhase();}
  }
  if(!active())return;
  const container=runtime.port.manager.container;
  if(container&&container!==scroller){scroller=container;const scroll=()=>{if(active()){input.onScroll();prune();}};container.addEventListener('scroll',scroll,{passive:true});cleanup.push(()=>container.removeEventListener('scroll',scroll));}
 };
 runtime.content.register(onContent);cleanup.push(()=>runtime.content.deregister(onContent));
 listen('rendered',()=>{if(active()){rendered=true;restore.mark(gen,'rendered');input.onPhase();}});
 listen('displayerror',error=>{if(active()&&transaction){transaction.abort(error instanceof Error?error:new Error('EPUB display failed'));}});
 listen('relocated',value=>{
  if(!active())return;const event=value as {start?:{cfi?:string;percentage?:number};end?:{cfi?:string}};
  if(!event.start?.cfi||!event.end?.cfi)return;
  lastRange={start:event.start.cfi,end:event.end.cfi};locationVersion++;
  restore.relocated(gen,lastRange,(range,anchor)=>{try{const cfi=new EpubCFI();return cfi.compare(range.start,anchor)<=0&&cfi.compare(anchor,range.end)<=0;}catch{return false;}});
  const percentage=runtime.percentage(event.start.cfi),snapshot={location:event.start.cfi,percentage:Number.isFinite(percentage)?Math.max(0,Math.min(100,percentage)):Math.max(0,Math.min(100,(event.start.percentage??0)*100))};
  if(rebinding===0&&restore.confirmProgress(gen,snapshot))input.onProgress(snapshot);
  const geometry=runtime.port.geometry();if(geometry)runtime.port.manager.settings.offset=geometry.buffer;
  input.onPhase();
 });
 function wait<T>(operation:PromiseLike<T>|T,signal:AbortSignal):Promise<T>{return new Promise((resolve,reject)=>{
  if(signal.aborted){reject(signal.reason);return;}const cancel=()=>reject(signal.reason);signal.addEventListener('abort',cancel,{once:true});
  Promise.resolve(operation).then(resolve,reject).finally(()=>signal.removeEventListener('abort',cancel));
 });}
 async function bounded<T>(signal:AbortSignal,run:()=>Promise<T>):Promise<T>{const owner=transaction;const timer=setTimeout(()=>owner?.abort(new Error('EPUB restore timed out')),5000);try{return await wait(run(),signal);}finally{clearTimeout(timer);}}
 async function until(test:()=>boolean,signal:AbortSignal){await bounded(signal,async()=>{while(!test()){await wait(runtime.port.nextFrame(),signal);}});}
 return {
  port:runtime.port,
  phase:()=>rebinding>0?'restoring':restore.phase(),
  contents:()=>[...contents.values()].map(c=>c.contents),
  projections:()=>[...projections.values()].map(p=>p.projection),
  projection: (doc:Document)=>projections.get(doc)?.projection,
  cfiCounts:()=>scope.diagnostics(),
  range:()=>lastRange?{...lastRange}:null,
  setRebind(callback:typeof rebind){rebind=callback;},
  setProjectionEnabled(enabled:boolean){projectionEnabled=enabled;if(enabled){for(const entry of contents.values())ensureProjection(entry.contents);}else{for(const entry of projections.values())entry.off();projections.clear();}},
  async restoreTo(snapshot:ReadingProgressSnapshot,reason:RestoreReason){
   if(!active())return;transaction?.abort();const current=new AbortController();transaction=current;
   gen=restore.begin(snapshot,reason);input.onPhase();const signal=current.signal;
   try{
    await wait(runtime.ready(),signal);
    const version=locationVersion;
    await bounded(signal,()=>Promise.resolve(runtime.port.display(snapshot.location)));
    if(!snapshot.location.startsWith('epubcfi(')){
     const requested=runtime.anchorForTarget?.(snapshot.location);
     if(runtime.anchorForTarget&&!requested)throw new Error('Requested EPUB source anchor is not loaded');
     if(!runtime.anchorForTarget&&locationVersion===version){runtime.port.reportLocation();await until(()=>locationVersion>version,signal);}
     const anchor=requested??lastRange?.start;
     if(!anchor)throw new Error('EPUB did not report a source anchor');
     snapshot={location:anchor,percentage:runtime.percentage(anchor)};
     gen=restore.begin(snapshot,reason);
    }
    restore.mark(gen,'displayed');
    await wait(rebind?.(signal),signal);restore.mark(gen,'projection-rebound');
    await reflowAtCanonicalAnchor(runtime.port,snapshot.location,signal);prune();
    signal.throwIfAborted();restore.mark(gen,'geometry-stable');if(rendered)restore.mark(gen,'rendered');
    runtime.port.reportLocation();await until(()=>restore.phase()==='ready',signal);input.onPhase();
   }catch(error){if(active()&&transaction===current&&!signal.aborted){restore.fail(gen,error);input.onPhase();throw error;}if(active()&&transaction===current&&signal.reason instanceof Error&&signal.reason.name!=='AbortError'){restore.fail(gen,signal.reason);input.onPhase();throw signal.reason;}}
  },
  dispose(){if(disposed)return;disposed=true;lifetime.abort();transaction?.abort();for(const off of cleanup.splice(0))off();for(const entry of contents.values())entry.off();contents.clear();for(const entry of projections.values())entry.off();projections.clear();scope.dispose();runtime.port.dispose?.();},
 };
}
