import {expect,it} from 'vitest';
import {readingFlowOptions,readingWindowGeometry,updateReadingBuffer,moveReadingScreen} from '@/components/reader/reading-flow';
const readingRect={left:0,top:70,right:1200,bottom:900},browserRect={left:0,top:0,right:1200,bottom:720};
it('uses a full spread and the actually clipped vertical screen',()=>{
 expect(readingFlowOptions('vertical')).toEqual({manager:'continuous',flow:'scrolled-continuous',spread:'none'});
 expect(readingFlowOptions('paginated')).toEqual({manager:'continuous',flow:'paginated',spread:'auto'});
 expect(readingWindowGeometry({flow:'paginated',readingRect,browserRect,layoutDelta:1200})).toMatchObject({screenStep:1200,buffer:2400,neighborhood:{left:-2400,right:3600}});
 expect(readingWindowGeometry({flow:'vertical',readingRect,browserRect})).toMatchObject({screenStep:650,buffer:1300,neighborhood:{top:-1230,bottom:2020}});
 expect(readingWindowGeometry({flow:'vertical',readingRect,browserRect,scrollRect:{left:20,right:900,top:100,bottom:500}})).toMatchObject({screenStep:400,buffer:800,visible:{left:20,right:900,top:100,bottom:500}});
 expect(readingWindowGeometry({flow:'vertical',readingRect:{...readingRect,top:1000},browserRect})).toBeNull();
 expect(readingWindowGeometry({flow:'paginated',readingRect,browserRect,layoutDelta:NaN})).toBeNull();
});
it('reapplies buffer around check/update and awaits their completion after a screen move',async()=>{
 const g=readingWindowGeometry({flow:'vertical',readingRect,browserRect})!,calls:unknown[]=[];
 const manager={settings:{offset:0},scrollBy:(x:number,y:number,silent?:boolean)=>{calls.push([x,y,silent]);},check:async()=>{calls.push(['check',manager.settings.offset]);manager.settings.offset=20;},update:async(offset?:number)=>{calls.push(['update',offset,manager.settings.offset]);manager.settings.offset=30;}};
 await moveReadingScreen(manager,g,1);
 expect(calls).toEqual([[0,650,true],['check',1300],['update',1300,1300]]);expect(manager.settings.offset).toBe(1300);
 const failed={...manager,check:async()=>new Error('bad view')};await expect(updateReadingBuffer(failed,g)).rejects.toThrow('bad view');
});
it('synchronizes silent scrolling coordinates before continuous manager checks them',async()=>{
 const g=readingWindowGeometry({flow:'paginated',readingRect,browserRect,layoutDelta:1200})!;
 const container={scrollLeft:0,scrollTop:0} as HTMLElement;
 const manager={container,scrollLeft:0,scrollTop:0,settings:{offset:0},scrollBy:(x:number,y:number)=>{container.scrollLeft+=x;container.scrollTop+=y;},check:async()=>{expect(manager.scrollLeft).toBe(1200);},update:async()=>{}};
 await moveReadingScreen(manager,g,1);expect(manager.scrollLeft).toBe(1200);
});
it('clips structural DOMRects without treating unrelated properties as coordinates',()=>{
 const rect={...readingRect,width:1200,height:830,toJSON:()=>({})};
 expect(readingWindowGeometry({flow:'vertical',readingRect:rect,browserRect})?.screenStep).toBe(650);
});
it('synchronizes silent native scroll caches before neighbor check and update',async()=>{
 const container={scrollLeft:2360,scrollTop:0} as HTMLElement,seen:number[]=[],g=readingWindowGeometry({flow:'paginated',readingRect:{left:0,top:0,right:1180,bottom:700},browserRect:{left:0,top:0,right:1180,bottom:700},layoutDelta:1180})!;
 const manager={settings:{offset:0},container,scrollLeft:0,scrollTop:0,check:async()=>{seen.push(manager.scrollLeft);container.scrollLeft=3540;},update:async()=>{seen.push(manager.scrollLeft);},scrollBy:()=>{}};
 await updateReadingBuffer(manager,g);expect(seen).toEqual([2360,3540]);expect(manager.scrollLeft).toBe(3540);
});
it('moves an offscreen source anchor by full pagination screens, not by an arbitrary column',async()=>{
 const {anchorScrollDelta}=await import('@/components/reader/reading-flow');
 const g=readingWindowGeometry({flow:'paginated',readingRect:{left:50,right:1230,top:50,bottom:700},browserRect:{left:0,right:1280,top:0,bottom:800},layoutDelta:1180})!;
 expect(anchorScrollDelta(g,{left:1242,right:1252,top:80,bottom:100})).toEqual({x:1180,y:0});
 expect(anchorScrollDelta(g,{left:650,right:680,top:80,bottom:100})).toEqual({x:0,y:0});
 expect(anchorScrollDelta(g,{left:-560,right:-550,top:80,bottom:100})).toEqual({x:-1180,y:0});
 expect(anchorScrollDelta({...g,axis:'vertical'},{left:100,right:120,top:900,bottom:930})).toEqual({x:0,y:849});
});
it('runs explicit buffer operations after pending native lifetime tasks instead of racing destruction',async()=>{
 const events:string[]=[],tasks:Array<()=>Promise<unknown>>=[];
 const enqueue=(run:()=>Promise<unknown>)=>new Promise(resolve=>{tasks.push(async()=>resolve(await run()));});
 const m:any={settings:{offset:0},scrollBy:()=>{},enqueue,check:async()=>{events.push('check');tasks.push(async()=>{events.push('native-destroy');});},update:async()=>{events.push('update');}};
 const g=readingWindowGeometry({flow:'paginated',readingRect:{left:0,top:0,right:1200,bottom:700},browserRect:{left:0,top:0,right:1200,bottom:700},layoutDelta:1200})!;
 const operation=updateReadingBuffer(m,g);await Promise.resolve();expect(events).toEqual([]);
 while(tasks.length){await tasks.shift()!();await Promise.resolve();}await operation;expect(events).toEqual(['check','native-destroy','update']);
});
it('synchronizes native prepend/target scrolls before same-tick continuous checks and restores owned methods',async()=>{
 const {installContinuousScrollSync}=await import('@/components/reader/reading-flow');
 const container={scrollLeft:0,scrollTop:0} as HTMLElement,m:any={container,scrollLeft:0,scrollTop:0,scrollBy(x:number,y:number){container.scrollLeft+=x;container.scrollTop+=y;},scrollTo(x:number,y:number){container.scrollLeft=x;container.scrollTop=y;}};
 const by=m.scrollBy,to=m.scrollTo,off=installContinuousScrollSync(m);m.scrollBy(24190,0,true);expect(m.scrollLeft).toBe(24190);m.scrollTo(1180,650,true);expect([m.scrollLeft,m.scrollTop]).toEqual([1180,650]);off();expect(m.scrollBy).toBe(by);expect(m.scrollTo).toBe(to);
});
it('keeps a vertical restore caret fully inside the viewport despite integer scroll rounding',async()=>{
 const {anchorScrollDelta}=await import('@/components/reader/reading-flow');const g=readingWindowGeometry({flow:'vertical',readingRect:{left:50,right:910,top:50,bottom:740},browserRect:{left:0,right:960,top:0,bottom:760}})!;
 expect(anchorScrollDelta(g,{left:560,right:580,top:49.84375,bottom:82.84375})).toEqual({x:0,y:-1.15625});
 expect(anchorScrollDelta(g,{left:560,right:580,top:80,bottom:113})).toEqual({x:0,y:0});
});
it('does not leave the next user scroll ignored after a silent native no-op',async()=>{
 const {installContinuousScrollSync}=await import('@/components/reader/reading-flow');const container={scrollLeft:0,scrollTop:39} as HTMLElement;
 const m={container,scrollLeft:0,scrollTop:39,ignore:false,scrollBy(_x:number,y:number,silent?:boolean){if(silent)this.ignore=true;container.scrollTop=Math.round(container.scrollTop+y);},scrollTo(x:number,y:number,silent?:boolean){if(silent)this.ignore=true;container.scrollLeft=x;container.scrollTop=y;}};
 const off=installContinuousScrollSync(m);m.scrollBy(0,-0.1,true);expect(m.ignore).toBe(false);m.scrollTo(0,39,true);expect(m.ignore).toBe(false);m.scrollBy(0,20,true);expect(m.ignore).toBe(true);off();
});
