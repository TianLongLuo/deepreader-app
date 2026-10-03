// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createElement,useEffect,useRef,StrictMode} from 'react';
import {cleanup,fireEvent,render,screen,waitFor,act} from '@testing-library/react';
import {EpubCFI} from 'epubjs';
import ReaderLayout from '@/components/reader/reader-layout';
const fixture=vi.hoisted(()=>({instances:[] as ReturnType<typeof makeRendition>[],writes:[] as {location:string;percentage:number}[],hold:false,budgets:[] as any[],props:[] as Array<unknown>}));
const anchor='epubcfi(/6/2[ch1]!/4/2/1:4)',end='epubcfi(/6/2[ch1]!/4/2/1:16)';
function makeRendition(doc:Document){
 const hooks=new Set<(contents:unknown)=>void>(),events=new Map<string,Set<(value:unknown)=>void>>();let size=600;
 const content={document:doc,window:doc.defaultView!,addStylesheetCss:()=>{},cfiFromRange:(r:Range)=>new EpubCFI(r,'/6/2[ch1]').toString()};
 doc.body.innerHTML='<p>CAT after CAT. Book paragraph with sufficient prose.</p>';
 const view={document:doc,contents:{...content,resizeCheck:()=>{}},layout:{delta:1200,format:()=>{}},displayed:true,rendered:true,expand:()=>{},width:()=>1200,height:()=>size,iframe:doc.defaultView!.frameElement};
 const emit=(name:string,value:unknown)=>events.get(name)?.forEach(fn=>fn(value));
 const rendition={content,hooks:{content:{register:(fn:(c:unknown)=>void)=>{hooks.add(fn);},deregister:(fn:(c:unknown)=>void)=>{hooks.delete(fn);}}},on:(name:string,fn:(value:unknown)=>void)=>{if(!events.has(name))events.set(name,new Set());events.get(name)!.add(fn);},off:(name:string,fn:(v:unknown)=>void)=>{events.get(name)?.delete(fn);},book:{ready:Promise.resolve(),loaded:{metadata:Promise.resolve({language:'en',layout:'reflowable'})},locations:{generate:async()=>{},percentageFromCfi:()=>.3},section:()=>({href:'ch1.xhtml',index:0})},themes:{register:()=>{},select:()=>{}},annotations:{remove:()=>{},underline:()=>{}},manager:{settings:{offset:0},layout:{delta:1200},container:doc.defaultView!.frameElement!.parentElement!,scrollTop:0,scrollLeft:0,check:async()=>{},update:async()=>{},scrollBy:()=>{}},views:()=>({all:()=>[view]}),getContents:()=>[content],reportLocation:()=>{emit('relocated',{start:{cfi:anchor,percentage:.3},end:{cfi:end}});},display:async()=>{if(fixture.hold)await new Promise(()=>{});for(const fn of hooks)fn(content);emit('rendered',view);emit('displayed',view);rendition.reportLocation();},next:vi.fn(),prev:vi.fn(),emit,hooksCount:()=>hooks.size,listenersCount:()=>[...events.values()].reduce((n,set)=>n+set.size,0),changeSize:()=>size++};
 return rendition;
}
vi.mock('react-reader',()=>({ReactReaderStyle:{readerArea:{}},ReactReader:(props:{getRendition:(r:unknown)=>void;epubOptions?:{flow?:string};location?:string|number;tocChanged?:(toc:unknown[])=>void})=>{
 fixture.props.push(props.location);
 const iframe=useRef<HTMLIFrameElement>(null);
 useEffect(()=>{const r=makeRendition(iframe.current!.contentDocument!);fixture.instances.push(r);props.getRendition(r);props.tocChanged?.([{id:"test-ch1",label:"Test chapter",href:"ch1.xhtml"}]);void r.display();},[]);
 return createElement('iframe',{ref:iframe,'data-fixture-flow':props.epubOptions?.flow});
}}));
vi.mock('next/link',()=>({default:(props:Record<string,unknown>)=>createElement('a',props)}));
vi.mock('@/components/reader/study-dock',()=>({default:({children,panel,open}:{children:unknown;panel:unknown;open:boolean})=>createElement('div',{'data-reading-body':true},children as never,open?panel as never:null)}));
vi.mock('@/components/reader/reader-utilities',()=>({default:()=>null}));
vi.mock('@/components/reader/word-lookup-content',()=>({default:()=>createElement('div',{'data-testid':'word-panel'})}));
vi.mock('@/components/reader/explanation-panel',()=>({default:()=>createElement('div',{'data-testid':'grammar-panel'})}));
vi.mock('@/components/reader/pdf-original-view',()=>({default:()=>null}));
vi.mock('@/hooks/use-meaning-group-reading',()=>({useMeaningGroupReading:(input:any)=>{fixture.budgets.push(input.budget);return ({unsupported:false,skipped:0,retry:()=>{},pending:0,ready:0,failed:0,blocked:false,deferred:0,retryAt:null});}}));
beforeEach(()=>{
 fixture.instances=[];fixture.budgets=[];fixture.props=[];fixture.writes=[];fixture.hold=false;localStorage.clear();
 vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({left:0,right:1200,top:0,bottom:700,width:1200,height:700,x:0,y:0,toJSON:()=>{}});
 vi.stubGlobal('fetch',async(_url:string,options?:RequestInit)=>{if(options?.method==='PATCH'){fixture.writes.push(JSON.parse(String(options.body)));return Response.json({ok:true});}return Response.json({items:[],progress:{location:anchor,percentage:30}});});
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
const mount=()=>render(createElement(ReaderLayout,{document:{id:'book',title:'Fixture',fileType:'EPUB',language:'en'},currentUser:{id:'user',email:'fixture@example.test'}}));
it('rebuilds three independent flow instances, cleans old hooks and saves only confirmed progress during restore',async()=>{
 const view=mount();await waitFor(()=>expect(view.container.querySelector('[data-reading-phase]')?.getAttribute('data-reading-phase')==='ready'?'ready':view.container.querySelector('[role=alert]')?.textContent).toBe('ready'));
 const select=screen.getByLabelText('阅读方式');
 fixture.hold=true;fireEvent.change(select,{target:{value:'vertical'}});
 await waitFor(()=>expect(fixture.instances).toHaveLength(2));
 expect(fixture.instances[0].hooksCount()).toBe(0);expect(fixture.instances[0].listenersCount()).toBe(0);
 expect(view.container.querySelector('iframe')?.getAttribute('data-fixture-flow')).toBe('scrolled-continuous');
 fireEvent(window,new Event('pagehide'));await waitFor(()=>expect(fixture.writes).toContainEqual({location:anchor,percentage:30}));
 act(()=>fixture.instances[0].emit('relocated',{start:{cfi:'epubcfi(/6/2[ch1]!/4/2/1:0)',percentage:0},end:{cfi:end}}));
 expect(fixture.writes.every(write=>write.location===anchor)).toBe(true);
 fixture.hold=false;fireEvent.change(select,{target:{value:'paginated'}});
 await waitFor(()=>expect(fixture.instances).toHaveLength(3));await waitFor(()=>expect(view.container.querySelector('[data-reading-phase]')?.getAttribute('data-reading-phase')==='ready'?'ready':view.container.querySelector('[role=alert]')?.textContent).toBe('ready'));
 expect(fixture.instances[1].hooksCount()).toBe(0);expect(fixture.instances[2].hooksCount()).toBe(1);
});
it('leaves vertical wheel native and keeps paginated wheel page turns',async()=>{
 const view=mount();await waitFor(()=>expect(view.container.querySelector('[data-reading-phase]')?.getAttribute('data-reading-phase')==='ready'?'ready':view.container.querySelector('[role=alert]')?.textContent).toBe('ready'));
 let r=fixture.instances[0];const pageWheel=new r.content.window.WheelEvent('wheel',{deltaY:100,cancelable:true});r.content.document.dispatchEvent(pageWheel);
 expect(pageWheel.defaultPrevented).toBe(true);expect(r.next).toHaveBeenCalledTimes(1);
 fireEvent.change(screen.getByLabelText('阅读方式'),{target:{value:'vertical'}});await waitFor(()=>expect(fixture.instances).toHaveLength(2));await waitFor(()=>expect(view.container.querySelector('[data-reading-phase]')?.getAttribute('data-reading-phase')==='ready'?'ready':view.container.querySelector('[role=alert]')?.textContent).toBe('ready'));
 r=fixture.instances[1];const verticalWheel=new r.content.window.WheelEvent('wheel',{deltaY:100,cancelable:true});r.content.document.dispatchEvent(verticalWheel);expect(verticalWheel.defaultPrevented).toBe(false);expect(r.next).not.toHaveBeenCalled();
});
it('offers an explicit restore retry without overwriting the saved anchor on display failure',async()=>{
 const view=mount();await waitFor(()=>expect(view.container.querySelector('[data-reading-phase]')?.getAttribute('data-reading-phase')).toBe('ready'));
 fixture.hold=true;fireEvent.change(screen.getByLabelText('阅读方式'),{target:{value:'vertical'}});await waitFor(()=>expect(fixture.instances).toHaveLength(2));
 act(()=>fixture.instances[1].emit('displayerror',new Error('broken display')));
 await waitFor(()=>expect(view.container.querySelector('[data-reading-phase]')?.getAttribute('data-reading-phase')).toBe('error'));
 fireEvent(window,new Event('pagehide'));await waitFor(()=>expect(fixture.writes).toContainEqual({location:anchor,percentage:30}));
 fixture.hold=false;fireEvent.click(screen.getByRole('button',{name:'重试阅读定位'}));
 await waitFor(()=>expect(view.container.querySelector('[data-reading-phase]')?.getAttribute('data-reading-phase')).toBe('ready'));
});

it('keeps the shared AI budget usable after React Strict Mode effect replay',async()=>{
 const view=render(createElement(StrictMode,null,createElement(ReaderLayout,{document:{id:'book',title:'Fixture',fileType:'EPUB',language:'en'},currentUser:{id:'user',email:'fixture@example.test'}})));
 await waitFor(()=>expect(view.container.querySelector('[data-reading-phase]')?.getAttribute('data-reading-phase')).toBe('ready'));
 const budget=fixture.budgets.at(-1);expect(budget).toBeDefined();await expect(budget.submit({id:'click',kind:'semantic-flip',rank:0,run:async()=> 'ready'}).result).resolves.toBe('ready');
});

it('flip mode closes a pinned grammar panel and suppresses old Enter and selection listeners',async()=>{
 const view=mount();await waitFor(()=>expect(view.container.querySelector('[data-reading-phase]')?.getAttribute('data-reading-phase')).toBe('ready'));
 const doc=fixture.instances[0].content.document,p=doc.querySelector('p')!;fireEvent.keyDown(p,{key:'Enter'});await waitFor(()=>expect(screen.getByTestId('grammar-panel')).toBeTruthy());
 fireEvent.click(screen.getByLabelText('语义翻牌'));await waitFor(()=>expect(screen.queryByTestId('grammar-panel')).toBeNull());
 fireEvent.keyDown(p,{key:'Enter'});const r=doc.createRange();r.selectNodeContents(p);doc.defaultView!.getSelection()!.addRange(r);fireEvent.mouseUp(p);
 expect(screen.queryByTestId('grammar-panel')).toBeNull();expect(screen.queryByTestId('word-panel')).toBeNull();
});

it('replaces one occurrence, keeps copy canonical and Alt+Enter restores a whole translated phrase',async()=>{
 const calls:string[]=[];vi.stubGlobal('fetch',async(url:string,options?:RequestInit)=>{calls.push(url);if(url==='/api/semantic-flip')return new Response([JSON.stringify({type:'start',requestId:'r',cached:false}),JSON.stringify({type:'complete',requestId:'r',value:{replacement:'a feline animal',provider:'fixture',model:'fixture'}})].join('\n'),{headers:{'Content-Type':'application/x-ndjson'}});return Response.json({items:[],progress:{location:anchor,percentage:30}});});
 const view=mount();await waitFor(()=>expect(view.container.querySelector('[data-reading-phase]')?.getAttribute('data-reading-phase')).toBe('ready'));
 fireEvent.click(screen.getByLabelText('语义翻牌'));const doc=fixture.instances[0].content.document,p=doc.querySelector('p')!,range=doc.createRange();range.setStart(p.firstChild!,0);range.setEnd(p.firstChild!,3);
 (doc as any).caretRangeFromPoint=()=>range;Object.defineProperty(doc.defaultView!.Range.prototype,'getClientRects',{configurable:true,value:()=>[{left:0,right:100,top:0,bottom:40,width:100,height:40}]});
 fireEvent.click(p,{clientX:10,clientY:10});await waitFor(()=>expect(p.textContent).toBe('a feline animal after CAT. Book paragraph with sufficient prose.'));await waitFor(()=>expect(view.container.querySelector('[data-reading-phase]')?.getAttribute('data-reading-phase')).toBe('ready'));
 expect(view.container.querySelector('.sr-only [lang=en]')?.textContent).toBe('CAT');
 const translated=doc.createRange();translated.setStart(p.firstChild!,0);translated.setEnd(p.firstChild!,15);doc.defaultView!.getSelection()!.removeAllRanges();doc.defaultView!.getSelection()!.addRange(translated);
 const setData=vi.fn(),copy=new doc.defaultView!.Event('copy',{bubbles:true,cancelable:true});Object.defineProperty(copy,'clipboardData',{value:{setData}});doc.dispatchEvent(copy);expect(setData).toHaveBeenCalledWith('text/plain','CAT');expect(copy.defaultPrevented).toBe(true);
 fireEvent.keyDown(p,{key:'Enter',altKey:true});await waitFor(()=>expect(p.textContent).toBe('CAT after CAT. Book paragraph with sufficient prose.'));expect(calls.filter(u=>u==='/api/semantic-flip')).toHaveLength(1);expect(calls.filter(u=>/dictionary|explain-text|reading-assistant/.test(u))).toEqual([]);
});

it('does not feed href navigation into a second ReactReader display owner',async()=>{
 const view=mount();await waitFor(()=>expect(view.container.querySelector('[data-reading-phase]')?.getAttribute('data-reading-phase')).toBe('ready'));
 fireEvent.click(screen.getByLabelText('打开目录与书签'));fireEvent.click(screen.getByRole('button',{name:'Test chapter'}));await act(async()=>{await new Promise(r=>setTimeout(r,80));});
 expect(fixture.props).not.toContain('ch1.xhtml');
});
