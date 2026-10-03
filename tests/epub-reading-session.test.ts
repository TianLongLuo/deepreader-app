// @vitest-environment jsdom
import {expect,it,vi} from 'vitest';
import {createEpubReadingSession} from '@/components/reader/epub-reading-session';
import {createReadingRestoreController} from '@/components/reader/reading-restore';
vi.mock('@/components/reader/epub-engine-adapter',()=>({reflowAtCanonicalAnchor:async(port:any,cfi:string)=>{await port.display(cfi);port.reportLocation();}}));
it('uses the requested chapter source anchor, not an intermediate neighboring relocation',async()=>{
 const a='epubcfi(/6/4!/4/2/1:0)',target='epubcfi(/6/6!/4/2/1:0)',events=new Map<string,(v:any)=>void>(),displayed:string[]=[];
 const emit=(cfi:string)=>events.get('relocated')?.({start:{cfi},end:{cfi}});
 const port:any={views:()=>[],manager:{settings:{}},geometry:()=>({buffer:1200}),display:async(t:string)=>{displayed.push(t);events.get('rendered')?.({});emit(t.startsWith('epubcfi(')?t:a);},reportLocation:()=>emit(displayed.at(-1)?.startsWith('epubcfi(')?displayed.at(-1)!:a),nextFrame:async()=>{}};
 const runtime:any={port,ready:async()=>{},on:(n:string,f:any)=>events.set(n,f),off:(n:string)=>events.delete(n),content:{register:()=>{},deregister:()=>{}},percentage:()=>60,anchorForTarget:()=>target};
 const restore=createReadingRestoreController(),session=createEpubReadingSession({runtime,restore,onPhase:()=>{},onProgress:()=>{},onContents:()=>()=>{},onScroll:()=>{}});
 await session.restoreTo({location:'c3.xhtml',percentage:0},'initial');expect(displayed).toEqual(['c3.xhtml',target]);expect(restore.lastConfirmed()?.location).toBe(target);session.dispose();
});
it('resolves a loaded requested source without waiting for a blank intermediate viewport relocation',async()=>{
 const target='epubcfi(/6/4!/4/2/1:0)',events=new Map<string,(v:any)=>void>(),displayed:string[]=[];
 const emit=()=>events.get('relocated')?.({start:{cfi:target},end:{cfi:target}});
 const port:any={views:()=>[],manager:{settings:{}},geometry:()=>({buffer:1200}),display:async(t:string)=>{displayed.push(t);events.get('rendered')?.({});if(t.startsWith('epubcfi('))emit();},reportLocation:()=>{if(displayed.at(-1)?.startsWith('epubcfi('))emit();},nextFrame:()=>new Promise(r=>setTimeout(r,1))};
 const runtime:any={port,ready:async()=>{},on:(n:string,f:any)=>events.set(n,f),off:(n:string)=>events.delete(n),content:{register:()=>{},deregister:()=>{}},percentage:()=>30,anchorForTarget:()=>target};
 const restore=createReadingRestoreController(),session=createEpubReadingSession({runtime,restore,onPhase:()=>{},onProgress:()=>{},onContents:()=>()=>{},onScroll:()=>{}});
 await session.restoreTo({location:'c2.xhtml',percentage:0},'initial');expect(displayed).toEqual(['c2.xhtml',target]);expect(restore.lastConfirmed()?.location).toBe(target);session.dispose();
},7000);
it('rebinds newly loaded lifetimes before readiness and confirms no intermediate progress',async()=>{
 const events=new Map<string,(v:any)=>void>();let hook:(c:any)=>any=()=>{};let release!:()=>void;
 const gate=new Promise<void>(r=>release=r),progress=vi.fn(),rebind=vi.fn(async()=>{await gate;});
 const iframe=document.createElement('iframe');document.body.append(iframe);const doc=iframe.contentDocument!;doc.body.innerHTML='<p>CAT returned</p>';
 const port:any={views:()=>[{document:doc,layout:{format:async()=>{}},contents:{resizeCheck:()=>{}},expand:()=>{}}],manager:{settings:{}},geometry:()=>({buffer:1200}),reportLocation:()=>{},nextFrame:async()=>{}};
 const runtime:any={port,ready:async()=>{},on:(n:string,f:any)=>events.set(n,f),off:(n:string)=>events.delete(n),content:{register:(f:any)=>hook=f,deregister:()=>{}},percentage:()=>40};
 const restore=createReadingRestoreController(),cfi='epubcfi(/6/2!/4/2/1:0)',gen=restore.begin({location:cfi,percentage:40},'initial');for(const p of ['displayed','projection-rebound','geometry-stable','rendered'] as const)restore.mark(gen,p);restore.relocated(gen,{start:cfi,end:cfi},()=>true);
 const session=createEpubReadingSession({runtime,restore,onPhase:()=>{},onProgress:progress,onContents:()=>()=>{},onScroll:()=>{}});session.setRebind(rebind);session.setProjectionEnabled(true);
 const loading=hook({document:doc,window:iframe.contentWindow,cfiFromRange:()=>cfi,addStylesheetCss:()=>{}});
 expect(rebind).toHaveBeenCalledTimes(1);expect(session.phase()).toBe('restoring');events.get('relocated')?.({start:{cfi},end:{cfi}});expect(progress).not.toHaveBeenCalled();release();await loading;expect(session.phase()).toBe('ready');session.dispose();iframe.remove();
});
