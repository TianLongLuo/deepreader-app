import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createVocabularyDB} from './helpers/vocabulary-db';
import {createPracticeService} from '@/server/practice/service';
import {validatePractice} from '@/server/practice/validator';
const config=vi.hoisted(()=>({resolve:vi.fn()}));vi.mock('@/server/ai/config-resolver',()=>({aiConfigResolver:config}));
let db:Awaited<ReturnType<typeof createVocabularyDB>>;
beforeEach(async()=>{db=await createVocabularyDB();config.resolve.mockReset();});afterEach(async()=>{await db?.close();});
const input={mode:'reading',sourceLanguage:'en',definitionLanguage:'zh',wordCount:100,targetCount:3};
const passage='We allocated the budget for the campaign. '+Array.from({length:15},()=> 'The team reviewed the plan before starting.').join(' ');
const wire={passage,questions:[{id:'q1',question:'What was allocated?',answer:'The budget.',quote:'We allocated the budget for the campaign.'},{id:'q2',question:'What did the team review?',answer:'The plan.',quote:'The team reviewed the plan before starting.'}],applicationPrompt:'Explain a budget decision using the target words.'};
async function seed(){const ids=[];for(const lemma of ['allocate','budget','campaign'])ids.push((await db.seedSense({lemma,domain:'work.marketing.advertising',meaningEn:lemma+' in a marketing plan.',meaningZh:'营销情境',pos:lemma==='allocate'?'verb':'noun'})).id);return ids;}
function mockModel(ids:string[],onFirst?:()=>void,semantic=true){config.resolve.mockResolvedValue({maxTokens:4096,provider:{stream:async function*(request:{systemPrompt:string}){if(request.systemPrompt.includes('independent semantic')){yield {content:JSON.stringify({valid:semantic,targets:ids.map((senseId,i)=>({senseId,correct:semantic,surface:['allocated','budget','campaign'][i]})),questionsGrounded:true,applicationAppropriate:true})};}else{const raw=JSON.stringify(wire),cut=raw.indexOf('campaign.')+9;yield {content:raw.slice(0,cut)};onFirst?.();yield {content:raw.slice(cut)};}}}});}
it('rejects missing targets, absent two questions and quotes not copied from the passage',()=>{
 expect(()=>validatePractice({mode:'reading',wordCount:100,targets:[{lemma:'allocate',senseId:'s1',forms:['allocate','allocated'],meaning:'Allocate money.',domain:null,revision:0}],value:{...wire,passage:'A short article.',questions:[]}})).toThrow();
 expect(()=>validatePractice({mode:'reading',wordCount:100,targets:[],value:{...wire,questions:[{...wire.questions[0],quote:'invented quote'},wire.questions[1]]}})).toThrow();
});
it('streams decoded drafts before final chunks, validates inflections independently and hides answer keys',async()=>{
 const ids=await seed(),events:any[]=[];let early=false;mockModel(ids,()=>{early=events.some(e=>e.type==='delta');});
 for await(const event of createPracticeService(db.prisma).streamPractice(db.scope,input,new AbortController().signal))events.push(event);
 expect(early).toBe(true);const complete=events.at(-1);expect(complete.type).toBe('complete');expect(complete.value.status).toBe('ready');expect(complete.value.questions[0]).toEqual({id:'q1',question:wire.questions[0].question});
 const publicText=JSON.stringify(events);expect(publicText).not.toContain('answerKey');expect(publicText).not.toContain('营销情境');expect(publicText).not.toContain('The budget.');
 expect(JSON.parse((await db.prisma.learningTask.findFirstOrThrow()).answerKeyJson)[0].answer).toBe('The budget.');expect(await db.prisma.learningEvidence.count()).toBe(0);
});
it('rejects wrong semantic senses after one repair and marks persisted tasks failed',async()=>{
 const ids=await seed();mockModel(ids,undefined,false);await expect(async()=>{for await(const _ of createPracticeService(db.prisma).streamPractice(db.scope,input,new AbortController().signal)){} }).rejects.toMatchObject({code:'INVALID_OUTPUT'});
 expect((await db.prisma.learningTask.findFirstOrThrow()).status).toBe('failed');expect(await db.prisma.learningEvidence.count()).toBe(0);
});
it('keeps interrupted tasks failed, rejects foreign access and reopens its own failed task',async()=>{
 await seed();config.resolve.mockResolvedValue({maxTokens:4096,provider:{stream:async function*(){yield {content:'{"passage":"Partial'};throw new Error('PRIVATE provider detail');}}});
 const service=createPracticeService(db.prisma);await expect(async()=>{for await(const _ of service.streamPractice(db.scope,input,new AbortController().signal)){} }).rejects.toThrow();
 const task=await db.prisma.learningTask.findFirstOrThrow();expect(task.status).toBe('failed');await expect(service.getPractice({...db.scope,userId:'other-user'},task.id)).rejects.toMatchObject({status:404});expect((await service.getPractice(db.scope,task.id)).status).toBe('failed');
});
it('application mode creates only a task, not a passage or comprehension questions',async()=>{
 const ids=(await seed()).slice(0,2);config.resolve.mockResolvedValue({maxTokens:2048,provider:{stream:async function*(request:{systemPrompt:string}){yield {content:JSON.stringify(request.systemPrompt.includes('independent semantic')?{valid:true,targets:ids.map(senseId=>({senseId,correct:true})),questionsGrounded:true,applicationAppropriate:true}:{passage:'',questions:[],applicationPrompt:'Propose a campaign and allocate a budget.'})};}}});
 const events=[];for await(const event of createPracticeService(db.prisma).streamPractice(db.scope,{mode:'application',sourceLanguage:'en',definitionLanguage:'zh',targetCount:2,senseIds:ids},new AbortController().signal))events.push(event);
 expect(events.at(-1)).toMatchObject({type:'complete',value:{passage:'',questions:[],mode:'application'}});
});
it('marks a persisted task failed when the subscription ends before model generation',async()=>{
 const ids=await seed();mockModel(ids);const iterator=createPracticeService(db.prisma).streamPractice(db.scope,input,new AbortController().signal);
 await iterator.next();await iterator.next();await iterator.return(undefined);expect((await db.prisma.learningTask.findFirstOrThrow()).status).toBe('failed');
});
it('records confirmed reading exposure once without updating recognition scheduling',async()=>{
 const ids=await seed();mockModel(ids);const service=createPracticeService(db.prisma);for await(const _ of service.streamPractice(db.scope,input,new AbortController().signal)){}
 const task=await db.prisma.learningTask.findFirstOrThrow(),before=await db.prisma.reviewCard.findMany();await service.markRead(db.scope,task.id);await service.markRead(db.scope,task.id);
 expect(await db.prisma.reviewCard.findMany()).toEqual(before);expect(await db.prisma.learningEvidence.count({where:{kind:'reading-exposure'}})).toBe(3);expect(await db.prisma.learningEvidence.count({where:{kind:'application'}})).toBe(0);
});
it('rechecks model access after generation and rejects modified or deleted source senses',async()=>{
 const ids=await seed();mockModel(ids);const configValue=await config.resolve();config.resolve.mockReset();config.resolve.mockResolvedValueOnce(configValue).mockRejectedValue(new Error('PRIVATE revoked'));
 const service=createPracticeService(db.prisma);await expect(async()=>{for await(const _ of service.streamPractice(db.scope,input,new AbortController().signal)){} }).rejects.toMatchObject({code:'UNAVAILABLE'});expect((await db.prisma.learningTask.findFirstOrThrow()).status).toBe('failed');
});
it('puts the requested passage-only length and validated bounds in the actual model prompt',async()=>{
 const ids=await seed();mockModel(ids);const cfg=await config.resolve(),original=cfg.provider.stream,prompts:string[]=[];
 cfg.provider.stream=async function*(request:{systemPrompt:string}){prompts.push(request.systemPrompt);yield* original(request);};
 for await(const _ of createPracticeService(db.prisma).streamPractice(db.scope,input,new AbortController().signal)){}
 expect(prompts[0]).toContain('Aim for 100 words');expect(prompts[0]).toContain('70 to 130 words');expect(prompts[0]).toContain('do not count questions');
});
