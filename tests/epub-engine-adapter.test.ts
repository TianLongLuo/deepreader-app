import {afterEach,expect,it,vi} from 'vitest';
import {createRequire} from 'node:module';
import {JSDOM} from 'jsdom';
import {settleEpubGeometry,reflowAtCanonicalAnchor,type EpubReflowPort} from '@/components/reader/epub-engine-adapter';
import {readingWindowGeometry} from '@/components/reader/reading-flow';
const IframeView=createRequire(import.meta.url)('epubjs/lib/managers/views/iframe').default;
afterEach(()=>vi.useRealTimers());
function fixture(){
 const events:string[]=[],doc=new JSDOM('<p>Book</p>').window.document;let textWidth=1250,textHeight=900;
 const view={document:doc,iframe:{},settings:{axis:'horizontal',flow:'paginated',forceEvenPages:false},layout:{name:'reflowable',pageWidth:600,divisor:2,height:700,format:async()=>{events.push('format');}},contents:{textWidth:()=>textWidth,textHeight:()=>textHeight,resizeCheck:()=>{events.push('resize');}},lockedWidth:600,lockedHeight:700,_width:600,_height:700,reframe(width:number,height:number){this._width=width;this._height=height;},expand(){events.push('expand');IframeView.prototype.expand.call(this);},width(){return this._width;},height(){return this._height;}};
 const geometry=()=>readingWindowGeometry({flow:view.settings.axis==='horizontal'?'paginated':'vertical',readingRect:{left:0,top:0,right:1200,bottom:700},browserRect:{left:0,top:0,right:1200,bottom:700},layoutDelta:1200});
 const port:EpubReflowPort={views:()=>[view],manager:{settings:{offset:0},check:async()=>{events.push('check');},update:async()=>{events.push('update');},scrollBy:()=>{}},geometry,display:async cfi=>{events.push('display:'+cfi);},reportLocation:()=>{events.push('report');},nextFrame:async()=>{events.push('frame');}};
 return {port,view,events,setSize:(w:number,h:number)=>{textWidth=w;textHeight=h;}};
}
it('forces real IframeView expansion both larger and smaller, then restores the canonical anchor',async()=>{
 const {port,view,events,setSize}=fixture(),signal=new AbortController().signal;
 await reflowAtCanonicalAnchor(port,'saved-cfi',signal);expect(view.width()).toBe(1800);
 expect(events.indexOf('format')).toBeLessThan(events.indexOf('resize'));expect(events.indexOf('resize')).toBeLessThan(events.indexOf('expand'));
 expect(events.indexOf('check')).toBeLessThan(events.indexOf('update'));
 expect(events.indexOf('update')).toBeLessThan(events.indexOf('display:saved-cfi'));expect(events.at(-1)).toBe('report');
 setSize(590,400);await settleEpubGeometry(port,signal);expect(view.width()).toBe(600);
 view.settings.axis='vertical';view.settings.flow='scrolled-continuous';await settleEpubGeometry(port,signal);expect(view.height()).toBe(400);
 setSize(590,1400);await settleEpubGeometry(port,signal);expect(view.height()).toBe(1400);
});
it('rejects manager error values and zero-area geometry instead of proving readiness',async()=>{
 const {port}=fixture();port.manager.check=async()=>new Error('broken');await expect(settleEpubGeometry(port,new AbortController().signal)).rejects.toThrow('broken');
 port.geometry=()=>null;await expect(settleEpubGeometry(port,new AbortController().signal)).rejects.toThrow('geometry');
});
it('aborts immediately even when format or a frame never cooperates',async()=>{
 const {port,view}=fixture(),abort=new AbortController();view.layout.format=()=>new Promise(()=>{});
 const operation=settleEpubGeometry(port,abort.signal);abort.abort();await expect(operation).rejects.toMatchObject({name:'AbortError'});
});
it('does not wait forever for unstable layout or an engine display rejection swallowed upstream',async()=>{
 vi.useFakeTimers();const {port,view}=fixture();port.nextFrame=()=>new Promise(resolve=>setTimeout(()=>{view._height++;resolve();},16));
 const operation=settleEpubGeometry(port,new AbortController().signal),assert=expect(operation).rejects.toThrow('timed out');await vi.advanceTimersByTimeAsync(5100);await assert;
 port.nextFrame=async()=>{};port.display=()=>new Promise(()=>{});
 const restore=reflowAtCanonicalAnchor(port,'old-cfi',new AbortController().signal),restoreAssert=expect(restore).rejects.toThrow('timed out');await vi.advanceTimersByTimeAsync(5100);await restoreAssert;
});
it('invalidates a recycled view mapping when its Contents and Document are replaced',async()=>{
 const {mapLoadedView}=await import('@/components/reader/epub-engine-adapter');
 const first={} as Document,second={} as Document,contents={document:first,resizeCheck:()=>{}},view={contents,layout:{format:()=>{}},expand:()=>{},width:()=>10,height:()=>20},cache=new WeakMap();
 const a=mapLoadedView(cache,view);view.contents={...contents,document:second};const b=mapLoadedView(cache,view);expect(b).not.toBe(a);expect(b.document).toBe(second);expect(b.contents).toBe(view.contents);
});
it('corrects the measured anchor after native display before proving final geometry',async()=>{
 const {port,events}=fixture();(port as EpubReflowPort & {alignAnchor:()=>void}).alignAnchor=()=>{events.push('align');};
 await reflowAtCanonicalAnchor(port,'saved-cfi',new AbortController().signal);
 expect(events.indexOf('align')).toBeLessThan(events.indexOf('check'));expect(events.lastIndexOf('align')).toBeGreaterThan(events.indexOf('display:saved-cfi'));expect(events.lastIndexOf('align')).toBeLessThan(events.lastIndexOf('report'));
});
it('drains pending native lifetime decisions before formatting or relocating loaded views',async()=>{
 const {port,events}=fixture();port.manager.enqueue=async task=>{events.push('drain');return task();};
 await settleEpubGeometry(port,new AbortController().signal);expect(events[0]).toBe('drain');expect(events.lastIndexOf('drain')).toBeGreaterThan(events.lastIndexOf('frame'));
});
