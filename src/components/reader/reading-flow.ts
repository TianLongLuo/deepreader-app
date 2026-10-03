export type ReadingFlow='paginated'|'vertical';
export type ViewportRect={left:number;top:number;right:number;bottom:number};
export type ReadingWindowGeometry={axis:'horizontal'|'vertical';visible:ViewportRect;neighborhood:ViewportRect;screenStep:number;buffer:number};
export function readingFlowOptions(flow:ReadingFlow):{manager:'continuous';flow:'paginated'|'scrolled-continuous';spread:'auto'|'none'}{
 return {manager:'continuous',flow:flow==='vertical'?'scrolled-continuous':'paginated',spread:flow==='vertical'?'none':'auto'};
}
export function readingWindowGeometry(input:{flow:ReadingFlow;readingRect:ViewportRect;browserRect:ViewportRect;scrollRect?:ViewportRect;layoutDelta?:number}):ReadingWindowGeometry|null{
 const clips=[input.readingRect,input.browserRect,...(input.scrollRect?[input.scrollRect]:[])];
 if(clips.some(r=>[r.left,r.top,r.right,r.bottom].some(n=>!Number.isFinite(n))))return null;
 const visible={left:Math.max(...clips.map(r=>r.left)),right:Math.min(...clips.map(r=>r.right)),top:Math.max(...clips.map(r=>r.top)),bottom:Math.min(...clips.map(r=>r.bottom))};
 if(visible.right<=visible.left||visible.bottom<=visible.top)return null;
 const horizontal=input.flow==='paginated',screenStep=horizontal?(input.layoutDelta??visible.right-visible.left):visible.bottom-visible.top;
 if(!Number.isFinite(screenStep)||screenStep<=0)return null;
 const buffer=screenStep*2,neighborhood={...visible};
 if(horizontal){neighborhood.left-=buffer;neighborhood.right+=buffer;}else{neighborhood.top-=buffer;neighborhood.bottom+=buffer;}
 return {axis:horizontal?'horizontal':'vertical',visible,neighborhood,screenStep,buffer};
}
export type ContinuousManagerPort={settings:{offset:number};check():Promise<unknown>;update(offset?:number):Promise<unknown>;scrollBy(x:number,y:number,silent?:boolean):void;
 /** Pinned continuous manager caches these independently from its real scroller. */
 container?:HTMLElement;scrollTop?:number;scrollLeft?:number;enqueue?:(task:()=>Promise<unknown>)=>Promise<unknown>};
export function syncReadingScroll(manager:ContinuousManagerPort):void{if(manager.container){manager.scrollTop=manager.container.scrollTop;manager.scrollLeft=manager.container.scrollLeft;}}
export async function updateReadingBuffer(manager:ContinuousManagerPort,g:ReadingWindowGeometry):Promise<void>{
 const run=async(operation:()=>Promise<unknown>)=>{
  const task=async()=>{syncReadingScroll(manager);manager.settings.offset=g.buffer;const result=await operation();if(result instanceof Error)throw result;syncReadingScroll(manager);manager.settings.offset=g.buffer;return result;};
  return manager.enqueue?manager.enqueue(task):task();
 };
 // Separate queue entries allow check's own queued lifetime tasks to finish before update.
 await run(()=>manager.check());await run(()=>manager.update(g.buffer));
}
export async function moveReadingScreen(manager:ContinuousManagerPort,g:ReadingWindowGeometry,direction:-1|1):Promise<void>{
 manager.scrollBy(g.axis==='horizontal'?direction*g.screenStep:0,g.axis==='vertical'?direction*g.screenStep:0,true);
 if(manager.container){manager.scrollTop=manager.container.scrollTop;manager.scrollLeft=manager.container.scrollLeft;}
 await updateReadingBuffer(manager,g);
}

/** Preserve full-spread paging when the pinned manager reports an offscreen target after neighbor reflow. */
export function anchorScrollDelta(g:ReadingWindowGeometry,rect:ViewportRect):{x:number;y:number}{
 if(g.axis==='horizontal'){const inside=rect.right>g.visible.left&&rect.left<g.visible.right;return {x:inside?0:Math.floor((rect.left-g.visible.left)/g.screenStep)*g.screenStep,y:0};}
 // Native scrollTop rounds to pixels; leave a one-pixel inset so Mapping includes the anchor line.
 const top=g.visible.top+1,inside=rect.top>=top&&rect.bottom<=g.visible.bottom;return {x:0,y:inside?0:rect.top-top};
}
/** Native continuous fill checks run before DOM scroll events; keep its cached offsets coherent synchronously. */
export function installContinuousScrollSync(manager:{container?:HTMLElement;scrollTop?:number;scrollLeft?:number;ignore?:boolean;scrollBy:(x:number,y:number,silent?:boolean)=>void;scrollTo?:(x:number,y:number,silent?:boolean)=>void}):()=>void{
 const by=manager.scrollBy,to=manager.scrollTo;
 const invoke=(run:()=>void)=>{
  const scroller=manager.container,before=scroller?[scroller.scrollLeft,scroller.scrollTop]:null,ignored=manager.ignore;
  run();syncReadingScroll(manager as ContinuousManagerPort);
  // Silent no-ops produce no DOM event to consume native `ignore`; preserve its prior state.
  if(scroller&&before&&scroller.scrollLeft===before[0]&&scroller.scrollTop===before[1])manager.ignore=ignored;
 };
 const wrappedBy=(x:number,y:number,silent?:boolean)=>invoke(()=>by.call(manager,x,y,silent));
 const wrappedTo=(x:number,y:number,silent?:boolean)=>invoke(()=>to?.call(manager,x,y,silent));
 manager.scrollBy=wrappedBy;if(to)manager.scrollTo=wrappedTo;
 return ()=>{if(manager.scrollBy===wrappedBy)manager.scrollBy=by;if(to&&manager.scrollTo===wrappedTo)manager.scrollTo=to;};
}
