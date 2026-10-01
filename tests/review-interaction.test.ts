// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {createElement} from 'react';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import ReviewWorkspace from '@/components/study/review-workspace';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const front={sessionId:'session',cardId:'card',version:0,word:'squint',sentence:'I squint against the wind.',sourceLanguage:'en',remaining:1};
it('fetches no answer before flip and reuses the grading operation after a network failure',async()=>{
 const calls:Array<{url:string;payload:any}>=[];let rated=0,gets=0;
 vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{
  const payload=init?.body?JSON.parse(String(init.body)):null;calls.push({url,payload});
  if(url.includes('/reveal'))return Response.json({meaning:'眯起眼睛看',collocation:'squint at a screen',definitionLanguage:'zh',fallback:false});
  if(url.includes('/rate')){rated++;if(rated===1)return Response.json({error:'请重试'},{status:503});return Response.json({due:'2026-10-02T00:00:00Z',version:1});}
  return Response.json({front:++gets===1?front:null,dueCount:gets===1?1:0,nextDue:'2026-10-02T00:00:00Z'});
 }));
 render(createElement(ReviewWorkspace,{definitionLanguage:'zh',sourceLanguage:undefined}));
 await screen.findByText('显示答案');expect(screen.queryByText('眯起眼睛看')).toBeNull();expect(calls).toHaveLength(1);expect(screen.queryByText('想起来了')).toBeNull();
 fireEvent.click(screen.getByText('显示答案'));await screen.findByText('眯起眼睛看');fireEvent.click(screen.getByText('想起来了'));await screen.findByRole('alert');
 expect(screen.getByText('眯起眼睛看')).toBeTruthy();fireEvent.click(screen.getByText('重试评分'));await screen.findByText('今天的复习已完成');
 const grades=calls.filter(x=>x.url.includes('/rate'));expect(grades).toHaveLength(2);expect(grades[0].payload).toEqual(grades[1].payload);expect(grades[0].payload.operationId).toBeTruthy();
});
it('clears a revealed answer when switching language and rejects late responses',async()=>{
 let resolve:(value:Response)=>void=()=>{};
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>url.includes('/reveal')?new Promise<Response>(r=>{resolve=r;}):Response.json({front,dueCount:1,nextDue:null})));
 const view=render(createElement(ReviewWorkspace,{definitionLanguage:'zh'}));await screen.findByText('显示答案');fireEvent.click(screen.getByText('显示答案'));
 view.rerender(createElement(ReviewWorkspace,{definitionLanguage:'en'}));await waitFor(()=>expect(screen.getByText('显示答案')).toBeTruthy());resolve(Response.json({meaning:'OLD PRIVATE ANSWER',collocation:null}));await new Promise(r=>setTimeout(r,20));expect(screen.queryByText('OLD PRIVATE ANSWER')).toBeNull();
});
