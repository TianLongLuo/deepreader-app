// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {capabilityLabels} from '@/components/study/word-display';
import PracticeReader from '@/components/study/practice-reader';
import PracticeWorkspace from '@/components/study/practice-workspace';
import type {PracticePublic} from '@/server/practice/types';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const task:PracticePublic={id:'task',mode:'reading',sourceLanguage:'en',definitionLanguage:'zh',level:'B2',targets:[{senseId:'a',lemma:'allocate'},{senseId:'b',lemma:'budget'},{senseId:'c',lemma:'campaign'}],applicationTargetIds:['a','b','c'],deferred:[],passage:'We allocated the budget to the campaign.',questions:[{id:'q1',question:'What was allocated?'},{id:'q2',question:'Why did they allocate it?'}],applicationPrompt:'Tell a colleague how you will allocate money.',status:'ready',stage:'ready',revised:false,usedHint:false};
it('keeps recognition and usage independent rather than claiming complete mastery',()=>{
 expect(capabilityLabels({recognition:'learning',applicationEvidence:[]})).toEqual({recognition:'阅读识别：学习中',usage:'主动使用：尚未练习'});
 expect(capabilityLabels({recognition:'new',applicationEvidence:[{result:true,usedHint:true,disputed:false}]}).usage).toContain('提示');
});
it('shows grounded questions but no answer keys, definitions or feedback before submission',()=>{
 const html=renderToStaticMarkup(createElement(PracticeReader,{task,answers:{},expression:'',onAnswer:()=>{},onExpression:()=>{},onRead:()=>{},onHint:()=>{},onSubmit:()=>{},busy:false}));
 expect(html).toContain('What was allocated?');expect(html).toContain('提交回答');expect(html).not.toContain('answerKey');expect(html).not.toContain('Assign money for a purpose');expect(html).not.toContain('We did.');
});
it('offers both usable modes without generating an article for application mode',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({items:[]})));render(createElement(PracticeWorkspace,{definitionLanguage:'zh',sourceLanguage:'en'}));
 expect(screen.getByRole('button',{name:'生成训练'})).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'应用训练'}));
 expect(screen.queryByLabelText('短文词数')).toBeNull();expect(screen.getByLabelText('目标词数量')).toHaveProperty('max','3');
});
it('requires an explicit confirmation before merging or splitting and keeps the original sources',async()=>{
 const {default:SenseControls}=await import('@/components/study/sense-controls');const {waitFor}=await import('@testing-library/react');const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
 const fetch=vi.fn(async(url:string,_init?:RequestInit)=>Response.json(url.includes('/senses?')?{revision:0,selectedDictionarySenseId:null,candidates:[],changes:[]}:{items:[{id:'other',word:'allocate',sourceLanguage:'en',contextMeaning:'Another sense'}]}));vi.stubGlobal('fetch',fetch);
 render(createElement(SenseControls,{id:'current',word:'allocate',sourceLanguage:'en',revision:0,sources:[{id:'source1',bookTitle:'Book',sentence:'We allocated money.'}],onChanged:()=>{}}));
 fireEvent.click(screen.getByText('义项确认、合并与拆分'));await waitFor(()=>expect(screen.getByLabelText('合并到哪个义项')).toBeTruthy());
 fireEvent.change(screen.getByLabelText('合并到哪个义项'),{target:{value:'other'}});fireEvent.click(screen.getByRole('button',{name:'合并到选中义项'}));expect(confirm).toHaveBeenCalled();expect(fetch.mock.calls.some(call=>(call[1] as any)?.method==='POST')).toBe(false);confirm.mockRestore();
});

it.each(['dispute','read'])('fences a delayed %s mutation when a different task is reopened',async kind=>{
 const a={...task,id:'A',targets:[{senseId:'a',lemma:'alpha'}],applicationPrompt:'Scenario A.'},b={...task,id:'B',targets:[{senseId:'b',lemma:'beta'}],applicationPrompt:'Scenario B.'};
 const feedback={responseId:'response-A',summary:'A-only feedback',priorityIssue:null,naturalExpression:'A-only answer',retryPrompt:'Try A again',extraProblems:[],targets:[],answers:[],usedHint:false,disputed:false,answerBasis:[]};
 let finish!:(value:Response)=>void;const delayed=new Promise<Response>(resolve=>{finish=resolve;});
 vi.stubGlobal('fetch',vi.fn(async (url:string,init?:RequestInit)=>{if((kind==='dispute'&&init?.method==='PATCH')||(kind==='read'&&init?.method==='POST'))return delayed;if(url==='/api/study/practice')return Response.json({items:[a,b]});if(url.endsWith('/answer'))return Response.json({response:url.includes('/A/')?{id:'response-A',operationId:'op-A',status:'ready',submission:{answers:{},expression:'A expression',usedHint:false,previousResponseId:null},feedback}:null});return Response.json(url.endsWith('/A')?a:b);}));
 render(createElement(PracticeWorkspace,{definitionLanguage:'zh',sourceLanguage:'en'}));await waitFor(()=>expect(screen.getByRole('button',{name:/阅读 · alpha/,hidden:true})).toBeTruthy());document.querySelector('details')?.setAttribute('open','');
 fireEvent.click(screen.getByRole('button',{name:/阅读 · alpha/,hidden:true}));await screen.findByText('A-only feedback');fireEvent.click(screen.getByRole('button',{name:kind==='dispute'?'反馈有误':'我已读完 · 记录一次接触'}));
 fireEvent.click(screen.getByRole('button',{name:/阅读 · beta/,hidden:true}));await screen.findByText('Scenario B.');await act(async()=>{finish(Response.json({disputed:true,recorded:true}));await delayed;});
 expect(screen.queryByText('A-only feedback')).toBeNull();expect(screen.queryByText('A-only answer')).toBeNull();expect(screen.queryByText('已记录一次阅读接触，复习排程保持不变。')).toBeNull();expect(screen.getByText('Scenario B.')).toBeTruthy();
});
