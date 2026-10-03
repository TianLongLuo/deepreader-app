// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {createElement} from 'react';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {savedLookupPayload} from '@/components/reader/lookup-session';
import WordLookupContent from '@/components/reader/word-lookup-content';
import {useReaderStore} from '@/hooks/use-reader-store';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('saves source fields immediately without ever saving an unvalidated draft',()=>{
 const source={word:'occasion',context:'An occasion.',sourceLanguage:'en' as const};
 expect(savedLookupPayload(source,{draft:'Possible meaning',answer:null,busy:true})).toMatchObject(source);
 expect(savedLookupPayload(source,{draft:'Possible meaning',answer:null,busy:true}).aiExplanation).toBeUndefined();
 expect(savedLookupPayload(source,{draft:'',answer:{answer:'A special event.'},busy:false}).aiExplanation).toBe('A special event.');
});
it('renders contextual and further-understanding drafts while generation remains busy',async()=>{
 const streams:Array<ReadableStreamDefaultController<Uint8Array>>=[];const canceled:boolean[]=[];
 useReaderStore.setState({sourceLanguage:'en',explanationLanguage:'English',bilingualMode:false});
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
  if(url.startsWith('/api/dictionary'))return Response.json({word:'occasion',meanings:[]});
  const index=streams.length;return new Response(new ReadableStream({start(c){streams.push(c);},cancel(){canceled[index]=true;}}),{headers:{'Content-Type':'application/x-ndjson'}});
 }));
 const save=vi.fn().mockResolvedValue(undefined);
 const view=render(createElement(WordLookupContent,{userId:'reader',documentId:'d',selection:{text:'occasion',contextText:'An occasion.',location:'loc'},entries:[],onSave:save}));
 await waitFor(()=>expect(streams).toHaveLength(1));
 const send=(index:number,text:string)=>streams[index].enqueue(new TextEncoder().encode(JSON.stringify({type:'start',requestId:'req'+index,cached:false})+'\n'+JSON.stringify({type:'delta',requestId:'req'+index,text})+'\n'));
 await act(async()=>send(0,'Context draft'));
 expect(screen.getByText('Context draft')).toBeTruthy();
 fireEvent.click(screen.getByLabelText('收藏单词'));await waitFor(()=>expect(save).toHaveBeenCalledTimes(1));expect(JSON.parse(save.mock.calls[0][2]).aiExplanation).toBeUndefined();
 fireEvent.click(screen.getByText('例句'));await waitFor(()=>expect(streams).toHaveLength(2));await act(async()=>send(1,'Example draft'));
 expect(screen.getByText('Example draft')).toBeTruthy();
 view.rerender(createElement(WordLookupContent,{userId:'reader',documentId:'d',selection:{text:'event',contextText:'An event.',location:'next'},entries:[],onSave:save}));
 await waitFor(()=>expect(streams).toHaveLength(3));expect(screen.queryByText('Example draft')).toBeNull();expect(screen.queryByText('Context draft')).toBeNull();
 view.unmount();await waitFor(()=>expect(canceled).toEqual([true,true,true]));
});
it('streams reading-tool actions immediately and cancels when the tool is hidden',async()=>{
 const {default:ReadingTools}=await import('@/components/reader/reading-tools');
 let stream!:ReadableStreamDefaultController<Uint8Array>,canceled=false,payload:any,headers:any;
 vi.stubGlobal('fetch',vi.fn(async(_url:string,init:RequestInit)=>{payload=JSON.parse(String(init.body));headers=init.headers;return new Response(new ReadableStream({start(c){stream=c;},cancel(){canceled=true;}}),{headers:{'Content-Type':'application/x-ndjson'}});}));
 const props={documentId:'d',selection:{text:'I waited.',location:'loc'},entries:[],embedded:true,open:true,onClose:()=>{},onOpen:()=>{},onJump:()=>{},onDetailed:()=>{},onSave:async()=>{},onDelete:async()=>{},onQuote:()=>{},onRestoreSelection:()=>{}};
 const view=render(createElement(ReadingTools,props));fireEvent.click(screen.getByText('先看大意'));
 await waitFor(()=>expect(stream).toBeTruthy());expect(headers.Accept).toBe('application/x-ndjson');expect(payload.mode).toBe('quick');
 await act(async()=>stream.enqueue(new TextEncoder().encode('{"type":"start","requestId":"tools","cached":false}\n{"type":"delta","requestId":"tools","text":"Reading draft"}\n')));
 expect(screen.getByText('Reading draft')).toBeTruthy();view.rerender(createElement(ReadingTools,{...props,open:false}));await waitFor(()=>expect(canceled).toBe(true));
});
it('includes the actual target word in further-understanding requests for source collocations',async()=>{
 const requests:any[]=[];
 useReaderStore.setState({sourceLanguage:'en',explanationLanguage:'English',bilingualMode:false});
 vi.stubGlobal('fetch',vi.fn(async(url:string,init:RequestInit)=>{
  if(url.startsWith('/api/dictionary'))return Response.json({word:'occasion',meanings:[]});
  requests.push(JSON.parse(String(init.body)));const requestId='lookup-target-'+requests.length;
  return new Response([{type:'start',requestId,cached:false},{type:'complete',requestId,value:{answer:'A special event.',citations:[]}}].map(e=>JSON.stringify(e)).join('\n')+'\n',{headers:{'Content-Type':'application/x-ndjson'}});
 }));
 render(createElement(WordLookupContent,{userId:'reader',documentId:'d',selection:{text:'occasion',contextText:'An occasion.',location:'loc'},entries:[],onSave:async()=>{}}));
 await waitFor(()=>expect(requests).toHaveLength(1));fireEvent.click(screen.getByText('常见搭配'));
 await waitFor(()=>expect(requests).toHaveLength(2));expect(requests[1]).toMatchObject({mode:'ask',question:'常见搭配: occasion',targetWord:'occasion'});
});
