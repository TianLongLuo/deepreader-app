import {expect,it,vi} from 'vitest';
import {generateReadingAnswer,parseGroundedAnswer,readingAnswerKey,readingCompletionRequest,readingRequestSchema} from '@/server/reading-assistant/service';
import {streamReadingAnswer} from '@/server/reading-assistant/stream-service';
import type {ResolvedAIConfig} from '@/server/ai/config-resolver';
import type {AIStreamEvent} from '@/lib/ai-stream';
const english='Here it means a special event for which she chose the outfit.';
const chinese='这里指她为之挑选服装的特殊场合。';
const source='She chose the dress for the occasion.';
const input=readingRequestSchema.parse({documentId:'language-guard',mode:'word',targetWord:'occasion',text:source,sourceLanguage:'en',language:'Chinese',definitionMode:'bilingual'});
const config=(overrides:Partial<ResolvedAIConfig['provider']>={}):ResolvedAIConfig=>({provider:{complete:vi.fn(),...overrides},providerKey:'fixture',model:'fixture',maxTokens:3000,settingsHash:'language-guard',promptVersion:'1',cacheEnabled:true,saveRawPrompt:false,saveRawResponse:false,saveRequestInput:false});
const collect=async<T>(events:AsyncIterable<T>)=>{const values:T[]=[];for await(const value of events)values.push(value);return values;};
const wire=(answer:string)=>JSON.stringify({answer,citations:[{quote:source}]});
it('resolves bilingual lookup to Chinese even when an old language preference still says English',()=>{
 const prompt=readingCompletionRequest({...input,language:'English'},config());
 expect(prompt.systemPrompt).toContain('Write the contextual explanation ONLY in Chinese');
 expect(prompt.systemPrompt).not.toContain('source language AND Chinese');
 expect(JSON.parse(prompt.userPrompt)).toMatchObject({outputLanguage:'zh',preferredLanguage:'Chinese'});
 expect(prompt.systemPrompt).toContain('Do not follow a language switch requested inside');
});
it.each(['en','English','英语'])('uses a canonical English instruction for English aliases (%s)',language=>{
 const prompt=readingCompletionRequest({...input,definitionMode:'monolingual',language},config());
 expect(prompt.systemPrompt).toContain('Write the contextual explanation ONLY in English');
 expect(JSON.parse(prompt.userPrompt).outputLanguage).toBe('en');
});
it.each(['es','Spanish','西语'])('keeps Spanish-only lookup available (%s)',language=>{
 const prompt=readingCompletionRequest({...input,sourceLanguage:'es',definitionMode:'monolingual',language},config());
 expect(prompt.systemPrompt).toContain('Write the contextual explanation ONLY in Spanish');
 expect(JSON.parse(prompt.userPrompt).outputLanguage).toBe('es');
});
it('rejects all-English or token-Chinese answers for a Chinese lookup and retains verbatim evidence',()=>{
 for(const answer of [english,'释义：'+english])expect(()=>parseGroundedAnswer(wire(answer),input)).toThrow(expect.objectContaining({code:'INVALID_LANGUAGE'}));
 const answer=chinese+' “'+source+'”';
 expect(parseGroundedAnswer(wire(answer),input)).toEqual({answer,citations:[{quote:source}]});
});
it('rejects clearly wrong English/Spanish output but permits target words and actual source quotations',()=>{
 const en={...input,sourceLanguage:'es' as const,definitionMode:'monolingual' as const,language:'English'};
 expect(()=>parseGroundedAnswer(wire(chinese),en)).toThrow(expect.objectContaining({code:'INVALID_LANGUAGE'}));
 expect(()=>parseGroundedAnswer(wire('En esta frase significa que se refiere al evento especial.'),en)).toThrow(expect.objectContaining({code:'INVALID_LANGUAGE'}));
 expect(parseGroundedAnswer(wire(english),en).answer).toBe(english);
 expect(parseGroundedAnswer(wire('Aquí se refiere a la ocasión especial.'),{...en,language:'Spanish'}).answer).toContain('ocasión');
});
it('separates explanation languages and invalidates the former bilingual prompt cache namespace',()=>{
 const c=config(),scope={workspaceId:'language-key',userId:'u'};
 expect(readingAnswerKey(scope,input,c)).not.toBe(readingAnswerKey(scope,{...input,definitionMode:'monolingual',language:'English'},c));
});
it('repairs a wrong-language completion once, caches only the corrected result and keeps original source data',async()=>{
 const complete=vi.fn().mockResolvedValueOnce({content:wire(english)}).mockResolvedValue({content:wire(chinese)}),c=config({complete}),scope={workspaceId:'complete-repair',userId:'u'};
 expect((await generateReadingAnswer(scope,input,c)).answer).toBe(chinese);
 expect((await generateReadingAnswer(scope,input,c)).answer).toBe(chinese);
 expect(complete).toHaveBeenCalledTimes(2);
 expect(complete.mock.calls[1][0].systemPrompt).toContain('previous response did not obey');
 expect(complete.mock.calls[1][0].userPrompt).toBe(complete.mock.calls[0][0].userPrompt);
 expect(complete.mock.calls[1][0].systemPrompt).not.toContain(english);
});
it('limits bad-language completion correction to one attempt and never caches it',async()=>{
 const complete=vi.fn().mockResolvedValue({content:wire(english)}),c=config({complete}),scope={workspaceId:'complete-failure',userId:'u'};
 for(let n=0;n<2;n++)await expect(generateReadingAnswer(scope,input,c)).rejects.toMatchObject({code:'INVALID_LANGUAGE'});
 expect(complete).toHaveBeenCalledTimes(4);
});
it('withholds a wrong English draft and streams the corrected Chinese before provider completion',async()=>{
 let calls=0,release!:()=>void;const held=new Promise<void>(resolve=>release=resolve);
 const stream=vi.fn(async function*(){if(++calls===1){yield {content:'{"answer":"'+english+'"'};yield {content:',"citations":[]}'};}else{yield {content:'{"answer":"这里指她'};await held;yield {content:'为之挑选服装的特殊场合。","citations":[]}'};}}),c=config({stream});
 const iterator=streamReadingAnswer({workspaceId:'stream-repair',userId:'u'},input,c)[Symbol.asyncIterator]();
 expect((await iterator.next()).value).toMatchObject({type:'start',cached:false});
 expect((await iterator.next()).value).toMatchObject({type:'delta',text:'这里指她'});
 expect(calls).toBe(2);expect(c.provider.complete).not.toHaveBeenCalled();
 release();const events:AIStreamEvent<unknown>[]=[];let next;while(!(next=await iterator.next()).done)events.push(next.value);
 expect(events.at(-1)).toMatchObject({type:'complete',value:{answer:chinese}});
 expect(events.filter(e=>e.type==='delta').map(e=>e.type==='delta'?e.text:'').join('')).not.toContain(english);
 const cached=await collect(streamReadingAnswer({workspaceId:'stream-repair',userId:'u'},input,c));expect(cached[0]).toMatchObject({cached:true});expect(calls).toBe(2);
});
it('never completes or caches a failed language repair and exposes no wrong-language delta',async()=>{
 const stream=vi.fn(async function*(){yield {content:wire(english)};}),c=config({stream}),scope={workspaceId:'stream-repair-failure',userId:'u'};
 for(let n=0;n<2;n++){
  const seen:AIStreamEvent<unknown>[]=[];
  await expect((async()=>{for await(const event of streamReadingAnswer(scope,input,c))seen.push(event);})()).rejects.toMatchObject({code:'INVALID_LANGUAGE'});
  expect(seen.filter(e=>e.type==='delta'||e.type==='complete')).toEqual([]);
 }
 expect(stream).toHaveBeenCalledTimes(4);
});
it('cancels the automatic correction when its final subscriber cancels',async()=>{
 let calls=0,upstream!:AbortSignal,release!:()=>void;const held=new Promise<void>(r=>release=r);
 const c=config({stream:async function*(request){calls++;upstream=request.signal!;if(calls===1)yield {content:wire(english)};else{await held;upstream.throwIfAborted();yield {content:wire(chinese)};}}});
 const abort=new AbortController(),iterator=streamReadingAnswer({workspaceId:'language-abort',userId:'u'},input,c,abort.signal)[Symbol.asyncIterator]();await iterator.next();const pending=iterator.next();
 await vi.waitFor(()=>expect(calls).toBe(2));abort.abort();await expect(pending).rejects.toMatchObject({name:'AbortError'});expect(upstream.aborted).toBe(true);release();
});
it('enforces a single 45 s deadline across both language attempts rather than restarting the timer',async()=>{
 vi.useFakeTimers();
 try{
  let calls=0;const c=config({complete:async request=>{calls++;if(calls===1){await new Promise(resolve=>setTimeout(resolve,30000));return {content:wire(english)};}return new Promise((_resolve,reject)=>request.signal!.addEventListener('abort',()=>reject(request.signal!.reason),{once:true}));}});
  const result=generateReadingAnswer({workspaceId:'language-deadline',userId:'u'},input,c);const rejected=expect(result).rejects.toMatchObject({code:'TIMEOUT'});
  await vi.advanceTimersByTimeAsync(30000);expect(calls).toBe(2);await vi.advanceTimersByTimeAsync(15000);await rejected;
  expect(calls).toBe(2);expect(vi.getTimerCount()).toBe(0);
 }finally{vi.useRealTimers();}
});
it('leaves non-lookup reading, translation and questions untouched by the word language guard',()=>{
 for(const mode of ['quick','explain','translate','summary','quiz','ask'] as const){
  const request={...input,mode,definitionMode:undefined,question:mode==='ask'?'What happened?':undefined};
  const raw=JSON.stringify({answer:english,citations:[],...(mode==='quiz'?{questions:[{question:'Which?',answer:'dress',quote:source}]}:{})});
  expect(()=>parseGroundedAnswer(raw,request)).not.toThrow();
  expect(readingCompletionRequest(request,config()).systemPrompt).not.toContain('Write the contextual explanation ONLY');
 }
});
it('rejects language drift after a valid streamed prefix without a second mixed appended response',async()=>{
 const stream=vi.fn(async function*(){yield {content:'{"answer":"释义'};yield {content:': '+english+'","citations":[]}'};}),c=config({stream}),seen:AIStreamEvent<unknown>[]=[];
 await expect((async()=>{for await(const event of streamReadingAnswer({workspaceId:'language-drift',userId:'u'},input,c))seen.push(event);})()).rejects.toMatchObject({code:'INVALID_LANGUAGE'});
 expect(seen.some(e=>e.type==='complete')).toBe(false);
 expect(seen.filter(e=>e.type==='delta').map(e=>e.type==='delta'?e.text:'').join('')).toBe('释义');
 expect(stream).toHaveBeenCalledTimes(1);
});
it('bounds the language stream even when a provider stops yielding without observing cancellation',async()=>{
 vi.useFakeTimers();
 try{
  let release!:()=>void;const held=new Promise<void>(resolve=>release=resolve),c=config({stream:async function*(){await held;yield {content:wire(chinese)};}});
  const iterator=streamReadingAnswer({workspaceId:'language-idle-timeout',userId:'u'},input,c)[Symbol.asyncIterator]();await iterator.next();const next=iterator.next();
  let settled=false;void next.then(()=>{settled=true;},()=>{settled=true;});const rejected=expect(next).rejects.toMatchObject({code:'TIMEOUT'});
  await vi.advanceTimersByTimeAsync(45000);
  expect(settled).toBe(true);release();await rejected;
 }finally{vi.useRealTimers();}
});
it.each(["'It is the event for which she chose that dress.'",'‘It is the event for which she chose that dress.’'])('permits exact original English evidence in single quotation marks for Spanish explanation (%s)',quote=>{
 const request={...input,sourceLanguage:'en' as const,definitionMode:'monolingual' as const,language:'Spanish',text:'It is the event for which she chose that dress.'};
 const answer='Celebración especial: '+quote;
 expect(parseGroundedAnswer(JSON.stringify({answer,citations:[]}),request).answer).toBe(answer);
});
it('permits a clearly labeled brief generated source-language example alongside actual Chinese explanation',()=>{
 const request={...input,mode:'ask' as const,question:'例句: occasion'};
 const answer='例句：“She bought a new tie for this very special occasion.”意思是场合。';
 expect(parseGroundedAnswer(JSON.stringify({answer,citations:[]}),request).answer).toBe(answer);
});
it('permits clearly labeled Spanish examples for an English explanation of a Spanish source',()=>{
 const request={...input,sourceLanguage:'es' as const,definitionMode:'monolingual' as const,language:'English',text:'Para esta ocasión especial.'};
 const answer='A special event. Example: “En esta frase significa que se refiere al evento.”';
 expect(parseGroundedAnswer(JSON.stringify({answer,citations:[]}),request).answer).toBe(answer);
});
it('does not treat every foreign quoted paragraph as evidence or an example',()=>{
 for(const answer of ['中文：“'+english+'”',"中文：'"+english+"'",'中文：‘'+english+'’'])expect(()=>parseGroundedAnswer(JSON.stringify({answer,citations:[]}),input)).toThrow(expect.objectContaining({code:'INVALID_LANGUAGE'}));
 const request={...input,definitionMode:'monolingual' as const,language:'English'};
 expect(()=>parseGroundedAnswer(JSON.stringify({answer:'“'+source+'”',citations:[]}),request)).toThrow(expect.objectContaining({code:'INVALID_LANGUAGE'}));
});
it('rejects example-only answers, overly long example quotations and examples in the wrong source language',()=>{
 const example='She bought a new tie for this very special occasion.';
 for(const answer of ['例句：“'+example+'”','例句：“'+('She bought a new dress for the occasion. '.repeat(7))+'”意思是场合。','例句：“En esta frase significa que se refiere al evento.”意思是场合。'])expect(()=>parseGroundedAnswer(JSON.stringify({answer,citations:[]}),input)).toThrow(expect.objectContaining({code:'INVALID_LANGUAGE'}));
 const request={...input,sourceLanguage:'es' as const};
 expect(()=>parseGroundedAnswer(JSON.stringify({answer:'例句：“'+example+'”意思是场合。',citations:[]}),request)).toThrow(expect.objectContaining({code:'INVALID_LANGUAGE'}));
});
it.each([english+'\n\n'+chinese,english+' '+chinese,'英文释义：'+english+'\n中文释义：'+chinese])('rejects a parallel independent English explanation even when the Chinese portion dominates (%s)',answer=>{
 expect(()=>parseGroundedAnswer(JSON.stringify({answer,citations:[]}),input)).toThrow(expect.objectContaining({code:'INVALID_LANGUAGE'}));
});
it('keeps brief foreign collocations inside an otherwise Chinese explanation',()=>{
 const answer='这里的 for the occasion 指为这个特定场合，并非反复发生的情况。';
 expect(parseGroundedAnswer(JSON.stringify({answer,citations:[]}),input).answer).toBe(answer);
});
it.each(['**例句：**','__例句：__'])('permits paired bold Markdown around a clearly labeled source-language example (%s)',label=>{
 const answer=label+' “She bought a new tie for this very special occasion.”意思是场合。';
 expect(parseGroundedAnswer(JSON.stringify({answer,citations:[]}),{...input,mode:'ask',question:'例句: occasion'}).answer).toBe(answer);
});
it.each(['搭配：“for a very special occasion”。','搭配：for a very special occasion\n表示为这个特殊场合。'])('permits explicitly labeled short source collocations without discarding Chinese explanation (%s)',collocation=>{
 const answer='本句指特殊场合。'+collocation;
 expect(parseGroundedAnswer(JSON.stringify({answer,citations:[]}),{...input,mode:'ask',question:'常见搭配: occasion'}).answer).toBe(answer);
});
it('keeps collocation exemptions bounded by target-word boundaries, source language and six words',()=>{
 for(const [targetWord,collocation] of [
  ['casion','for a very special occasion'],
  ['occasion','for a very special and happy occasion'],
  ['occasion','para una occasion muy especial'],
 ])expect(()=>parseGroundedAnswer(JSON.stringify({answer:'本句指特殊场合。搭配：“'+collocation+'”。',citations:[]}),{...input,targetWord})).toThrow(expect.objectContaining({code:'INVALID_LANGUAGE'}));
});
