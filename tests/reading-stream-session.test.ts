import {expect,it} from 'vitest';
import {createReadingStreamSession} from '@/lib/reading-stream-session';
import type {ReadingAnswer,ReadingRequest} from '@/server/reading-assistant/service';
const input={documentId:'d',mode:'word' as const,text:'A word.',sourceLanguage:'en' as const,level:'intermediate' as const,language:'English'};
it('rejects late drafts and completions from word A after switching to B',async()=>{
 const requests:Array<{draft:(text:string)=>void;finish:(answer:ReadingAnswer)=>void;signal:AbortSignal}>=[];
 const session=createReadingStreamSession(()=>{},(_input,_signal,onDraft)=>new Promise(resolve=>requests.push({draft:onDraft,finish:resolve,signal:_signal})));
 const a=session.start(input);requests[0].draft('Draft A');expect(session.state().draft).toBe('Draft A');
 const b=session.start({...input,text:'B word.'});expect(requests[0].signal.aborted).toBe(true);
 requests[0].draft('Late A');requests[0].finish({answer:'Final A',citations:[]});await a;
 expect(session.state().answer).toBeNull();expect(session.state().draft).toBe('');
 requests[1].draft('Draft B');expect(session.state()).toMatchObject({draft:'Draft B',busy:true,answer:null});
 requests[1].finish({answer:'Final B',citations:[]});await b;expect(session.state()).toMatchObject({answer:{answer:'Final B'},busy:false});session.dispose();
});
it('aborts an open stream on close and never treats its retained draft as complete',async()=>{
 let signal!:AbortSignal,finish!:(answer:ReadingAnswer)=>void;
 const session=createReadingStreamSession(()=>{},(_input,s,onDraft)=>{signal=s;onDraft('Partial');return new Promise(resolve=>finish=resolve);});
 const run=session.start(input);session.stop();expect(signal.aborted).toBe(true);expect(session.state().answer).toBeNull();
 finish({answer:'Late',citations:[]});await run;expect(session.state().answer).toBeNull();session.dispose();
});
it('keeps a failed stream draft visible but unvalidated and shows an error',async()=>{
 const session=createReadingStreamSession(()=>{},async(_input,_signal,onDraft)=>{onDraft('Partial');throw new Error('provider secret');});
 await session.start(input);expect(session.state()).toMatchObject({draft:'Partial',answer:null,busy:false});expect(session.state().error).not.toContain('secret');expect(session.state().error).not.toBe('');session.dispose();
});
it('clears a rejected-language draft instead of keeping a misleading explanation visible',async()=>{
 const {AIStreamError}=await import('@/lib/ai-stream');
 const session=createReadingStreamSession(()=>{},async(_input,_signal,onDraft)=>{onDraft('Wrong language draft');throw new AIStreamError('INVALID_LANGUAGE','解释语言与所选语言不一致，请重试');});
 await session.start(input);expect(session.state()).toEqual({draft:'',answer:null,busy:false,error:'解释语言与所选语言不一致，请重试'});session.dispose();
});
it('clears typed wrong-language drafts in the legacy lookup transport as well',async()=>{
 const {vi}=await import('vitest'),{requestReadingAnswer}=await import('@/lib/reading-stream-session'),drafts:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async()=>new Response([
  {type:'start',requestId:'language-clear',cached:false},
  {type:'delta',requestId:'language-clear',text:'释义'},
  {type:'error',requestId:'language-clear',code:'INVALID_LANGUAGE',message:'解释语言与所选语言不一致，请重试'},
 ].map(e=>JSON.stringify(e)).join('\n')+'\n',{headers:{'Content-Type':'application/x-ndjson'}})));
 try{await expect(requestReadingAnswer(input,new AbortController().signal,text=>drafts.push(text))).rejects.toMatchObject({code:'INVALID_LANGUAGE'});expect(drafts).toEqual(['释义','']);}
 finally{vi.unstubAllGlobals();}
});
