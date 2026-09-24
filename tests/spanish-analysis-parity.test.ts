import { beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({findParagraph:vi.fn(),findExplanation:vi.fn(),create:vi.fn(),spans:vi.fn(),vocab:vi.fn(),resolve:vi.fn(),complete:vi.fn(),get:vi.fn(),set:vi.fn()}));
vi.mock('@/lib/prisma',()=>({prisma:{paragraph:{findUnique:mocks.findParagraph},paragraphExplanation:{findFirst:mocks.findExplanation,create:mocks.create},annotationSpan:{createMany:mocks.spans},vocabularyNote:{createMany:mocks.vocab}}}));
vi.mock('@/lib/redis',()=>({cacheService:{get:mocks.get,set:mocks.set,explanationCacheKey:(value:unknown)=>JSON.stringify(value)}}));
vi.mock('@/server/ai/config-resolver',()=>({aiConfigResolver:{resolve:mocks.resolve}}));
vi.mock('@/lib/logger',()=>({createChildLogger:()=>({info:vi.fn(),warn:vi.fn(),error:vi.fn()})}));
import { AIExplanationService } from '@/server/ai/explanation.service';
import { generateReadingAnswer, readingRequestSchema, parseGroundedAnswer } from '@/server/reading-assistant/service';
const sentences=['Aunque hubiera llovido, habríamos salido si nos lo hubieran pedido.','¿Por qué se lo dijiste a María, cuyo hermano aún no había llegado?'];
const source=sentences.join(' ');
const output={paragraph_summary:'虽然下雨，我们也会出门；随后询问为何告诉玛丽亚。',plain_meaning:'假设条件和追问。',sentence_roles:[{text:'habríamos salido',role:'verb',start_offset:0,end_offset:1,label:'条件式完成时',explanation:'条件未实现'},{text:'María',role:'object',start_offset:0,end_offset:1,label:'间接宾语',explanation:'告诉的对象'},{text:'a',role:'other',start_offset:source.indexOf('María')+4,end_offset:source.indexOf('María')+5,label:'invalid partial',explanation:'not an independent word here'}],who_did_what:[],vocabulary_notes:[{term:'hubiera llovido',meaning:'假设过去已下雨',translation:'下过雨',usage_note:'llover 的过去完成虚拟式'}],grammar_notes:[{pattern:'虚拟式与条件式完成时',explanation:'hubiera llovido 与 habríamos salido 表示过去未实现的假设'}],sentence_breakdown:sentences.map((sentence_text,i)=>({sentence_index:i+1,sentence_text,sentence_pattern:'oración compuesta',clause_type:'subordinada',clause_role:'条件或关系',subject_core:'',subject_modifier:'',verb_core:i?'dijiste':'habríamos salido',verb_modifier:'',object_core:i?'a María':'',object_modifier:'',logic:'假设和追问',logic_breakdown:'依据从句和主句关系理解',explanation:'省略主语可从变位推断；不补造原文主语',clause_map:[],reference_map:[],learning_focus:{plain_takeaway:'结合条件读主句',reading_tip:'注意虚拟式'}})),logic_flow:[],translation:'虽然下过雨，如果他们要求我们，我们本来会出去。你为什么告诉玛丽亚这件事，她的哥哥还没到呢？'};
beforeEach(()=>{
 vi.clearAllMocks();mocks.findParagraph.mockResolvedValue({id:'p',textHash:'spanish',rawText:source,document:{workspaceId:'w'},sentences:[]});mocks.findExplanation.mockResolvedValue(null);mocks.get.mockResolvedValue(null);
 mocks.create.mockImplementation(async({data})=>({id:'saved',createdAt:new Date(0),...data}));mocks.complete.mockResolvedValue({content:JSON.stringify(output)});
 mocks.resolve.mockResolvedValue({provider:{complete:mocks.complete},providerKey:'mock',model:'mock',maxTokens:8000,promptVersion:'1',settingsHash:'x',cacheEnabled:true,saveRawPrompt:false,saveRawResponse:false});
});
it('persists complex Spanish analysis with omitted subjects and exact Unicode spans, without English tense invention',async()=>{
 const result=await new AIExplanationService().explain('w',{paragraphId:'p',sourceLanguage:'es',explanationLanguage:'Chinese'});
 expect(result.status).toBe('COMPLETED');expect(mocks.complete).toHaveBeenCalledTimes(1);expect(mocks.create).toHaveBeenCalledTimes(1);
 const saved=JSON.parse(mocks.create.mock.calls[0][0].data.outputJson);expect(saved.sentence_breakdown[0].subject_core || '').toBe('');expect(saved.grammar_notes).toEqual(output.grammar_notes);
 for(const role of saved.sentence_roles)expect(source.slice(role.start_offset,role.end_offset)).toBe(role.text);
 expect(saved.sentence_roles.some((r:{text:string})=>r.text==='María')).toBe(true);
 expect(mocks.spans).toHaveBeenCalled();expect(mocks.vocab).toHaveBeenCalled();expect(mocks.set).toHaveBeenCalled();
});
it('repairs invented Spanish structure spans rather than persisting guessed offsets',async()=>{
 const invalid=structuredClone(output);invalid.sentence_breakdown[0].verb_core='habriamos salido';
 mocks.complete.mockResolvedValueOnce({content:JSON.stringify(invalid)}).mockResolvedValueOnce({content:JSON.stringify(output)});
 const result=await new AIExplanationService().explain('w',{paragraphId:'p',sourceLanguage:'es'});expect(result.status).toBe('COMPLETED');expect(mocks.complete).toHaveBeenCalledTimes(2);
 expect(JSON.parse(mocks.create.mock.calls[0][0].data.outputJson).sentence_breakdown[0].verb_core).toBe('habríamos salido');
});
it('rejects unrepaired fabricated spans even in a single Spanish sentence',async()=>{
 mocks.findParagraph.mockResolvedValue({id:'p',textHash:'single',rawText:sentences[0],document:{},sentences:[]});const invalid=structuredClone(output);invalid.sentence_breakdown=invalid.sentence_breakdown.slice(0,1);invalid.sentence_breakdown[0].subject_core='nosotros';mocks.complete.mockResolvedValue({content:JSON.stringify(invalid)});
 const result=await new AIExplanationService().explain('w',{paragraphId:'p',sourceLanguage:'es'});expect(result.status).toBe('FAILED');expect(mocks.set).not.toHaveBeenCalled();expect(mocks.spans).not.toHaveBeenCalled();
});
it('cancellation prevents storing generated Spanish answers and cache entries',async()=>{
 const abort=new AbortController();mocks.complete.mockImplementation(async()=>{abort.abort();return {content:JSON.stringify(output)};});
 await expect(new AIExplanationService().explain('w',{paragraphId:'p',sourceLanguage:'es',signal:abort.signal})).rejects.toMatchObject({name:'AbortError'});expect(mocks.create).not.toHaveBeenCalled();expect(mocks.set).not.toHaveBeenCalled();
});
it('keeps multilingual citations exact and caches different source/output languages separately',async()=>{
 const input=readingRequestSchema.parse({documentId:'d',mode:'word',sourceLanguage:'es',text:source,language:'Chinese'});
 const answer={answer:'habríamos 是 haber 的条件式第一人称复数。',citations:[{quote:'habríamos salido'}]};const config=await mocks.resolve();config.provider.complete=vi.fn().mockResolvedValue({content:JSON.stringify(answer)});
 const scope={workspaceId:'parity-cache',userId:'u'};expect((await generateReadingAnswer(scope,input,config)).citations[0].quote).toBe('habríamos salido');await generateReadingAnswer(scope,input,config);
 await generateReadingAnswer(scope,{...input,language:'English'},config);await generateReadingAnswer(scope,{...input,sourceLanguage:'en'},config);expect(config.provider.complete).toHaveBeenCalledTimes(3);
 expect(()=>parseGroundedAnswer(JSON.stringify({...answer,citations:[{quote:'habriamos salido'}]}),input)).toThrow();
});
it('persists equivalent English analysis and returns saved Spanish without synthesizing English grammar',async()=>{
 const english=structuredClone(output);english.sentence_breakdown=[{...english.sentence_breakdown[0],sentence_text:'We would have left.',subject_core:'We',verb_core:'would have left',sentence_pattern:'SVO'}];english.sentence_roles=[];
 mocks.findParagraph.mockResolvedValue({id:'p',textHash:'english',rawText:english.sentence_breakdown[0].sentence_text,document:{},sentences:[]});mocks.complete.mockResolvedValue({content:JSON.stringify(english)});
 expect((await new AIExplanationService().explain('w',{paragraphId:'p',sourceLanguage:'en',explanationLanguage:'Chinese'})).status).toBe('COMPLETED');
 const spanish=structuredClone(output);spanish.grammar_notes=[];
 mocks.findExplanation.mockResolvedValue({id:'saved-es',paragraphId:'p',provider:'mock',model:'mock',promptVersion:'1',status:'COMPLETED',outputJson:JSON.stringify(spanish),paragraph:{rawText:source},createdAt:new Date(0)});
 const saved=await new AIExplanationService().getExplanation('p','w');expect(saved?.output?.grammar_notes).toEqual([]);expect(saved?.output?.sentence_breakdown?.[0].verb_core).toBe('habríamos salido');
});
it('does not fabricate an English pronoun for incomplete Spanish reference metadata',async()=>{
 const {parseAndValidateExplanation}=await import('@/server/ai/response-validator');
 const candidate=JSON.parse(JSON.stringify(output));candidate.sentence_breakdown[0].reference_map=[{refers_to:'María'}];
 expect(parseAndValidateExplanation(JSON.stringify(candidate)).sentence_breakdown?.[0].reference_map).toBeUndefined();
});
it('accepts explicitly analyzed Spanish verbless exclamations without inventing a subject or verb',async()=>{
 const candidate=structuredClone(output);candidate.sentence_roles=[];candidate.sentence_breakdown=[{...candidate.sentence_breakdown[0],sentence_text:'¡Hola!',subject_core:'',verb_core:'',object_core:'',sentence_pattern:'interjección',clause_type:'enunciado nominal'}];
 mocks.findParagraph.mockResolvedValue({id:'p',textHash:'hello',rawText:'¡Hola!',document:{},sentences:[]});mocks.complete.mockResolvedValue({content:JSON.stringify(candidate)});
 expect((await new AIExplanationService().explain('w',{paragraphId:'p',sourceLanguage:'es'})).status).toBe('COMPLETED');expect(mocks.complete).toHaveBeenCalledTimes(1);
});
