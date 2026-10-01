import {randomUUID} from 'node:crypto';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createVocabularyDB} from './helpers/vocabulary-db';
import {createPracticeFeedback,savePracticeEvidence} from '@/server/practice/feedback';
import {createVocabularyQuery} from '@/server/vocabulary/query';
const config=vi.hoisted(()=>({resolve:vi.fn()}));vi.mock('@/server/ai/config-resolver',()=>({aiConfigResolver:config}));
let db:Awaited<ReturnType<typeof createVocabularyDB>>;
beforeEach(async()=>{db=await createVocabularyDB();config.resolve.mockReset();});afterEach(async()=>{await db?.close();});
async function fixture(mode='application'){
 const sense=await db.seedSense({lemma:'allocate',meaningEn:'Assign money for a purpose.',domain:'work.marketing.advertising'});
 const target={senseId:sense.id,lemma:'allocate',meaning:'Assign money for a purpose.',forms:['allocate','allocated'],domain:sense.domain,revision:sense.revision};
 const task=await db.prisma.learningTask.create({data:{...db.scope,mode,sourceLanguage:'en',definitionLanguage:'zh',level:'B2',targetsJson:JSON.stringify([target]),passage:mode==='reading'?'We allocated the budget.':'',questionsJson:mode==='reading'?'[{"id":"q1","question":"What was allocated?"},{"id":"q2","question":"Who allocated it?"}]':'[]',answerKeyJson:mode==='reading'?'[{"id":"q1","answer":"The budget.","quote":"We allocated the budget."},{"id":"q2","answer":"We did.","quote":"We allocated the budget."}]':'[]',applicationPrompt:'Tell your colleague how you allocated the budget.',status:'ready'}});
 return {sense,task,target};
}
const feedback=(senseId:string,correct:boolean|null=true)=>({summary:'表达清楚，先调整一个搭配。',priorityIssue:correct===false?'allocate 的意思与预算场景不符。':null,naturalExpression:'We allocated the budget to the campaign.',retryPrompt:'换一个预算场景再表达一次。',extraProblems:[],targets:[{senseId,meaningCorrect:correct,collocationNatural:correct,formCorrect:correct,reason:correct===null?'语境不足以确定。':'Fits the budget context.'}],answers:[]});
function model(value:unknown,onChunk?:()=>void){const raw=JSON.stringify(value),cut=raw.indexOf('。')+1;config.resolve.mockResolvedValue({maxTokens:2048,provider:{stream:async function*(){yield {content:raw.slice(0,cut)};onChunk?.();yield {content:raw.slice(cut)};}}});}
it('saves independent application evidence without changing recognition scheduling',async()=>{
 const {sense,task}=await fixture(),before=await db.prisma.reviewCard.findMany();const response=await db.prisma.learningResponse.create({data:{...db.scope,taskId:task.id,operationId:randomUUID(),responseJson:'{}'}});
 await savePracticeEvidence(db.prisma,db.scope,response,feedback(sense.id));expect(await db.prisma.reviewCard.findMany()).toEqual(before);expect(await db.prisma.learningEvidence.count({where:{kind:'application',result:true}})).toBe(1);
});
it('streams focused feedback, retains wrong-sense and uncertain results and deduplicates exact operations',async()=>{
 const {sense,task}=await fixture(),service=createPracticeFeedback(db.prisma),operationId=randomUUID(),payload={operationId,answers:{},expression:'The budget allocated my colleague.',usedHint:false},events:any[]=[];let early=false;model(feedback(sense.id,false),()=>{early=events.some(e=>e.type==='delta');});
 for await(const event of service.streamFeedback(db.scope,task.id,payload,new AbortController().signal))events.push(event);expect(early).toBe(true);expect(events.at(-1).value.targets[0].meaningCorrect).toBe(false);
 for await(const _ of service.streamFeedback(db.scope,task.id,payload,new AbortController().signal)){}expect(await db.prisma.learningResponse.count()).toBe(1);expect(await db.prisma.learningEvidence.count({where:{result:false}})).toBe(1);
 await expect(async()=>{for await(const _ of service.streamFeedback(db.scope,task.id,{...payload,expression:'Different payload'},new AbortController().signal)){} }).rejects.toMatchObject({status:409});
 model(feedback(sense.id,null));for await(const _ of service.streamFeedback(db.scope,task.id,{...payload,operationId:randomUUID(),previousResponseId:events.at(-1).value.responseId},new AbortController().signal)){}expect(await db.prisma.learningEvidence.count({where:{result:null}})).toBe(1);
});
it('tracks hints server-side, supports disputes, and reports practice attempts not mastery',async()=>{
 const {sense,task}=await fixture(),service=createPracticeFeedback(db.prisma);await service.hint(db.scope,task.id);model(feedback(sense.id));let final:any;
 for await(const event of service.streamFeedback(db.scope,task.id,{operationId:randomUUID(),answers:{},expression:'We allocated the budget.',usedHint:false},new AbortController().signal)){if(event.type==='complete')final=event.value;}
 expect(final.usedHint).toBe(true);expect((await db.prisma.learningEvidence.findFirstOrThrow()).usedHint).toBe(true);
 await service.dispute(db.scope,task.id,final.responseId);expect((await db.prisma.learningEvidence.findFirstOrThrow()).disputed).toBe(true);
 const word=await createVocabularyQuery(db.prisma).detail(db.scope,sense.id,'zh');expect(word.usage?.attempts).toBe(1);expect(word.usage?.lastResult).toBe('disputed');expect(word.recognitionState).toBe('new');
});
it('hides answer bases until valid submission, requires all questions and keeps failed responses without evidence',async()=>{
 const {sense,task}=await fixture('reading'),service=createPracticeFeedback(db.prisma);const payload={operationId:randomUUID(),answers:{q1:'The budget.',q2:'We did.'},expression:'We allocated the budget.'};
 model({...feedback(sense.id),answers:[{questionId:'q1',correct:true,reason:'Supported.'},{questionId:'q2',correct:true,reason:'Supported.'}]});let complete:any;
 for await(const event of service.streamFeedback(db.scope,task.id,payload,new AbortController().signal)){if(event.type==='complete')complete=event.value;}
 expect(complete.answerBasis[0].quote).toBe('We allocated the budget.');
 await expect(async()=>{for await(const _ of service.streamFeedback(db.scope,task.id,{...payload,operationId:randomUUID(),answers:{q1:'Only one'}},new AbortController().signal)){} }).rejects.toMatchObject({status:400});
 model({...feedback('other-user-sense')});await expect(async()=>{for await(const _ of service.streamFeedback(db.scope,task.id,{...payload,operationId:randomUUID()},new AbortController().signal)){} }).rejects.toMatchObject({code:'INVALID_OUTPUT'});expect(await db.prisma.learningEvidence.count()).toBe(1);expect(await db.prisma.learningResponse.count({where:{status:'failed'}})).toBe(1);
});
it('retains canceled attempts for exact-payload retry, checks scope and never writes draft evidence',async()=>{
 const {sense,task}=await fixture(),service=createPracticeFeedback(db.prisma),payload={operationId:randomUUID(),answers:{},expression:'We allocated a budget.'};
 model(feedback(sense.id));const iterator=service.streamFeedback(db.scope,task.id,payload,new AbortController().signal);await iterator.next();await iterator.return(undefined);
 expect((await db.prisma.learningResponse.findFirstOrThrow()).status).toBe('failed');expect(await db.prisma.learningEvidence.count()).toBe(0);
 await expect(async()=>{for await(const _ of service.streamFeedback({...db.scope,userId:'other-user'},task.id,payload,new AbortController().signal)){} }).rejects.toMatchObject({status:404});
 for await(const _ of service.streamFeedback(db.scope,task.id,payload,new AbortController().signal)){}expect(await db.prisma.learningResponse.count()).toBe(1);expect(await db.prisma.learningEvidence.count()).toBe(1);
});
it('does not commit feedback when the source revision or model access changes mid-stream',async()=>{
 const {sense,task}=await fixture(),service=createPracticeFeedback(db.prisma),raw=JSON.stringify(feedback(sense.id));
 config.resolve.mockResolvedValue({maxTokens:2048,provider:{stream:async function*(){yield {content:raw};await db.prisma.vocabularySense.update({where:{id:sense.id},data:{revision:{increment:1}}});}}});
 await expect(async()=>{for await(const _ of service.streamFeedback(db.scope,task.id,{operationId:randomUUID(),expression:'We allocated money.',answers:{}},new AbortController().signal)){} }).rejects.toMatchObject({status:409});expect(await db.prisma.learningEvidence.count()).toBe(0);
});
it('reopens its own submitted response without exposing answers for an unanswered task',async()=>{
 const {sense,task}=await fixture('reading'),service=createPracticeFeedback(db.prisma);expect((await service.latestResponse(db.scope,task.id)).response).toBeNull();
 const payload={operationId:randomUUID(),answers:{q1:'Budget',q2:'We'},expression:'We allocated the budget.'};model({...feedback(sense.id),answers:[{questionId:'q1',correct:true,reason:'Supported.'},{questionId:'q2',correct:true,reason:'Supported.'}]});
 for await(const _ of service.streamFeedback(db.scope,task.id,payload,new AbortController().signal)){}
 const reopened=await service.latestResponse(db.scope,task.id);expect(reopened.response?.submission.expression).toBe(payload.expression);expect(reopened.response?.feedback?.answerBasis[0].answer).toBe('The budget.');
 await expect(service.latestResponse({...db.scope,userId:'other-user'},task.id)).rejects.toMatchObject({status:404});
});
