// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,renderHook} from '@testing-library/react';
import {useMeaningGroupReading} from '@/hooks/use-meaning-group-reading';
import {createReaderAIClientBudget} from '@/components/reader/reader-ai-budget';
import {readingWindowGeometry} from '@/components/reader/reading-flow';
import {createTextProjection} from '@/components/reader/text-projection';
import {registerOriginalText} from '@/components/reader/original-text';
import {alignMeaningGroups} from '@/lib/meaning-groups';
import {splitMeaningText} from '@/lib/meaning-group-units';
const rect=(top=0,bottom=600)=>({left:0,right:600,top,bottom,width:600,height:bottom-top,x:0,y:top,toJSON:()=>({})});
let root:HTMLDivElement,scroll=0,refresh=()=>{},positions=new Map<string,number>(),requests:Array<{text:string;signal:AbortSignal}>,exposures:unknown[],highlights:Map<string,unknown>,pending=new Map<string,ReadableStreamDefaultController<Uint8Array>>(),held=new Set<string>();
const tick=async(ms=40)=>{await act(async()=>{await vi.advanceTimersByTimeAsync(ms);for(let i=0;i<18;i++)await Promise.resolve();});};
const frame=(text:string,type='complete')=>JSON.stringify({requestId:'fixture',type,...(type==='unit'?{index:0,value:alignMeaningGroups(text,{groups:[{text}]})}:{value:alignMeaningGroups(text,{groups:[{text}]})})})+'\n';
const complete=(text:string)=>{pending.get(text)!.enqueue(new TextEncoder().encode(frame(text)));pending.get(text)!.close();};
const add=(text:string,top:number,id=text)=>{const p=document.createElement('button');p.dataset.pdfSelectionKey=id;p.textContent=text;root.querySelector('[data-pdf-text-scroll]')!.append(p);positions.set(text,top);return p;};
const base=()=>({root:{current:root},documentId:'qa',userId:'u',language:'en' as const,enabled:true,ready:true,flow:'vertical' as const,theme:'light' as 'light'|'dark'|'sepia',aiEpoch:'0',budget:createReaderAIClientBudget({maxPrefetchStartsPerMinute:100}),geometry:()=>readingWindowGeometry({flow:'vertical',readingRect:rect(),browserRect:rect()}),subscribeGeometry:(listener:()=>void)=>{refresh=listener;return()=>{refresh=()=>{};};},locationFor:(source:{element:HTMLElement},range:Range)=>source.element.dataset.pdfSelectionKey+'@'+range.startOffset});
beforeEach(()=>{
 vi.useFakeTimers();root=document.createElement('div');root.innerHTML='<div data-reading-body><div data-pdf-text-scroll></div></div>';document.body.append(root);scroll=0;positions=new Map();requests=[];exposures=[];highlights=new Map();pending=new Map();held=new Set();
 vi.stubGlobal('CSS',{highlights});vi.stubGlobal('Highlight',class{priority=0;constructor(..._ranges:Range[]){}});
 vi.spyOn(Element.prototype,'getBoundingClientRect').mockReturnValue(rect());
 if(!Range.prototype.getClientRects)Object.defineProperty(Range.prototype,'getClientRects',{configurable:true,value:()=>[]});
 vi.spyOn(Range.prototype,'getClientRects').mockImplementation(function(this:Range){const text=this.startContainer.textContent??'';let top=positions.get(text)??positions.get(this.toString())??100;top+=this.startOffset>0?1800:0;return [rect(top-scroll,top-scroll+30)] as unknown as DOMRectList;});
 vi.stubGlobal('fetch',async(url:string,init?:RequestInit)=>{
  const body=JSON.parse(String(init?.body));if(url==='/api/study/exposures'){exposures.push(body);return Response.json({ok:true});}
  const text=body.text;requests.push({text,signal:init!.signal as AbortSignal});
  return new Response(new ReadableStream<Uint8Array>({start(c){c.enqueue(new TextEncoder().encode(JSON.stringify({requestId:'fixture',type:'start',cached:false})+'\n'));if(held.has(text)){pending.set(text,c);return;}c.enqueue(new TextEncoder().encode(frame(text)));c.close();}}),{headers:{'Content-Type':'application/x-ndjson'}});
 });
});
afterEach(()=>{cleanup();root.remove();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
it('keeps a pending request alive across theme and saturation repaint',async()=>{
 add('She waited.',100);held.add('She waited.');const input=base(),h=renderHook(props=>useMeaningGroupReading({...input,...props}),{initialProps:{theme:'light' as 'light'|'dark'|'sepia',lowSaturation:false}});await tick();expect(requests).toHaveLength(1);h.rerender({theme:'dark',lowSaturation:true});await tick();expect(requests).toHaveLength(1);expect(requests[0].signal.aborted).toBe(false);expect(highlights.size).toBe(0);h.unmount();input.budget.dispose();
});
it('prefetches only two neighboring screens, then exposes canonical positions only when visible',async()=>{
 add('A visible passage.',100,'A');add('B neighboring passage.',800,'B');add('C too far away.',2000,'C');const input=base(),h=renderHook(()=>useMeaningGroupReading(input));await tick(250);
 expect(requests.map(r=>r.text)).toEqual(['A visible passage.','B neighboring passage.']);expect(exposures).toHaveLength(1);expect(JSON.stringify(exposures)).not.toContain('B neighboring');
 scroll=700;act(()=>refresh());await tick(250);expect(requests).toHaveLength(3);expect(JSON.stringify(exposures)).toContain('B@0');expect(JSON.stringify(exposures)).toContain('B neighboring passage.');h.unmount();input.budget.dispose();
});
it('allows validated prefixes to paint but never exposes them or unfinished restore state',async()=>{
 add('A prefix only.',100,'A');held.add('A prefix only.');const input=base(),h=renderHook(({ready})=>useMeaningGroupReading({...input,ready}),{initialProps:{ready:true}});await tick();pending.get('A prefix only.')!.enqueue(new TextEncoder().encode(frame('A prefix only.','unit')));await tick(250);expect(highlights.size).toBeGreaterThan(0);expect(exposures).toEqual([]);
 h.rerender({ready:false});await tick();expect(requests[0].signal.aborted).toBe(true);expect(exposures).toEqual([]);h.rerender({ready:true});await tick();complete('A prefix only.');await tick(250);expect(exposures).toHaveLength(1);h.unmount();input.budget.dispose();
});
it('holds back exposure already queued when restore begins, without discarding the completed cache',async()=>{
 add('Ready source.',100,'A');const input=base(),h=renderHook(({ready})=>useMeaningGroupReading({...input,ready}),{initialProps:{ready:true}});await tick(40);expect(h.result.current.ready).toBe(1);h.rerender({ready:false});await tick(200);expect(exposures).toEqual([]);h.rerender({ready:true});await tick(250);expect(exposures).toHaveLength(1);expect(requests).toHaveLength(1);h.unmount();input.budget.dispose();
});
it('processes ten rolling windows and newly loaded source blocks without resending completed text',async()=>{
 for(let i=0;i<10;i++)add(`Window ${i}.`,i*600+100,'p'+i);const input=base(),h=renderHook(()=>useMeaningGroupReading(input));await tick(200);
 for(let i=1;i<10;i++){scroll=i*600;act(()=>refresh());await tick(200);expect(h.result.current.ready).toBe(1);}
 expect(new Set(requests.map(r=>r.text)).size).toBe(10);expect(requests).toHaveLength(10);add('Loaded chapter.',6100,'new');scroll=6000;act(()=>refresh());await tick(200);expect(requests.at(-1)?.text).toBe('Loaded chapter.');scroll=0;act(()=>refresh());await tick(200);expect(requests.filter(r=>r.text==='Window 0.')).toHaveLength(1);h.unmount();input.budget.dispose();
});
it('splits an entire normalized long source before geometry, so later pages retain stable unit boundaries',async()=>{
 const text=Array.from({length:110},(_,i)=>`Sentence number ${i} has enough words.`).join('  ');const normalized=text.replace(/\s+/g,' '),units=splitMeaningText(normalized,1200);add(text,100,'long');positions.set(text,100);const input=base(),h=renderHook(()=>useMeaningGroupReading(input));await tick(200);expect(requests.map(r=>r.text)).toEqual([units[0].text]);scroll=1700;act(()=>refresh());await tick(200);expect(requests.map(r=>r.text).slice(1)).toEqual(units.slice(1).map(u=>u.text));scroll=0;act(()=>refresh());await tick();expect(requests).toHaveLength(units.length);h.unmount();input.budget.dispose();
});
it('remeasures projection epochs without analyzing replacements or resending canonical text',async()=>{
 const p=add('The occasion was special.',100,'source'),projection=createTextProjection(p),unregister=registerOriginalText(projection);const input=base(),h=renderHook(()=>useMeaningGroupReading(input));await tick(200);const canonical=projection.canonicalDocument.createRange(),node=projection.canonicalNode(p.firstChild!)!;canonical.setStart(node,4);canonical.setEnd(node,12);projection.apply({id:'word',originalRange:canonical,replacement:'a big event'});act(()=>refresh());await tick(200);expect(requests.map(r=>r.text)).toEqual(['The occasion was special.']);expect(JSON.stringify(exposures)).not.toContain('a big event');h.unmount();unregister();projection.dispose();input.budget.dispose();
});
it('does not request invisible content or unsupported range highlighting and cancels on scope changes',async()=>{
 add('Invisible.',3000);const input=base(),h=renderHook(({aiEpoch})=>useMeaningGroupReading({...input,aiEpoch}),{initialProps:{aiEpoch:'0'}});await tick();expect(requests).toEqual([]);positions.set('Invisible.',100);held.add('Invisible.');act(()=>refresh());await tick();expect(requests).toHaveLength(1);h.rerender({aiEpoch:'new'});await tick();expect(requests[0].signal.aborted).toBe(true);expect(requests).toHaveLength(2);h.unmount();input.budget.dispose();
 const second=base();vi.stubGlobal('CSS',{});const u=renderHook(()=>useMeaningGroupReading(second));await tick();expect(u.result.current.unsupported).toBe(true);expect(requests).toHaveLength(2);u.unmount();second.budget.dispose();
});
it('includes loaded neighboring EPUB iframes using frame offsets but excludes a distant chapter',async()=>{
 const {EpubCFI}=await import('epubjs');root.querySelector('[data-reading-body]')!.innerHTML='';const frames:HTMLIFrameElement[]=[];
 for(const [i,text] of ['Current chapter.','Next chapter.','Distant chapter.'].entries()){
  const iframe=document.createElement('iframe');root.querySelector('[data-reading-body]')!.append(iframe);frames.push(iframe);const top=i===2?2200:i*600;
  Object.defineProperty(iframe,'getBoundingClientRect',{value:()=>rect(top,top+600)});iframe.contentDocument!.body.innerHTML='<p>'+text+'</p>';
  Object.defineProperty(iframe.contentWindow!,'CSS',{configurable:true,value:{highlights:new Map()}});Object.defineProperty(iframe.contentWindow!,'Highlight',{configurable:true,value:class{priority=0;}});
  const RangeType=(iframe.contentWindow as unknown as {Range:typeof Range}).Range;Object.defineProperty(RangeType.prototype,'getClientRects',{configurable:true,value:()=>[rect(100,130)]});
 }
 const {collectMeaningSources,sourceRange}=await import('@/components/reader/meaning-text-source');for(const f of frames){const sources=collectMeaningSources(f.contentDocument!.body);expect(sources).toHaveLength(1);expect(new EpubCFI(sourceRange(sources[0],0,sources[0].text.length),'/6/2').toString()).toContain('epubcfi(');}
 const input={...base(),locationFor:(source:{element:HTMLElement},range:Range)=>new EpubCFI(range,'/6/'+(2+2*frames.findIndex(f=>f.contentDocument===source.element.ownerDocument))).toString()},h=renderHook(()=>useMeaningGroupReading(input));await tick(250);
 expect(h.result.current).toMatchObject({skipped:0,unsupported:false});expect(requests.map(r=>r.text)).toEqual(['Current chapter.','Next chapter.']);expect(exposures).toHaveLength(1);expect(JSON.stringify(exposures)).not.toContain('Next chapter.');expect(JSON.stringify(exposures)).toContain('epubcfi(');h.unmount();input.budget.dispose();
});
it('suspends hidden tabs and resumes the same completed cache when visible',async()=>{
 add('Tab source.',100,'tab');const input=base(),h=renderHook(()=>useMeaningGroupReading(input));await tick(40);const visibility=vi.spyOn(document,'visibilityState','get');visibility.mockReturnValue('hidden');act(()=>document.dispatchEvent(new Event('visibilitychange')));await tick(200);expect(exposures).toEqual([]);visibility.mockReturnValue('visible');act(()=>document.dispatchEvent(new Event('visibilitychange')));await tick(250);expect(exposures).toHaveLength(1);expect(requests).toHaveLength(1);h.unmount();input.budget.dispose();
});
