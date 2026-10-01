import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createVocabularyDB} from './helpers/vocabulary-db';
const config=vi.hoisted(()=>({resolve:vi.fn()}));vi.mock('@/server/ai/config-resolver',()=>({aiConfigResolver:config}));
import {createEnrichmentGenerator} from '@/server/vocabulary/enrichment';
import {claimJob} from '@/server/vocabulary/jobs';
const wire={meaningZh:'迎风眯起眼睛。',meaningEn:'Narrow your eyes against the wind.',lemma:'squint',selectedDictionarySenseId:null,pos:'verb',semanticCategory:'perception',domain:'daily.body.visual',contextTags:['outdoors'],collocations:['squint at a screen','squint in sunlight'],uncertain:true};
let db:Awaited<ReturnType<typeof createVocabularyDB>>;
beforeEach(async()=>{db=await createVocabularyDB();config.resolve.mockReset();});afterEach(async()=>{await db?.close();});
it('streams decoded concise drafts before completion without raw JSON and validates taxonomy',async()=>{
 await db.seedEnrichmentJob();const job=(await claimJob(db.prisma,new Date()))!,progress=vi.fn();let observedBeforeFinal=false;
 const raw=JSON.stringify(wire),boundary=raw.indexOf('。')+1;
 config.resolve.mockResolvedValue({maxTokens:2048,provider:{stream:async function*(){yield {content:raw.slice(0,boundary)};observedBeforeFinal=progress.mock.calls.length>0;yield {content:raw.slice(boundary)};}}});
 const result=await createEnrichmentGenerator(db.prisma)(job,new AbortController().signal,progress);
 expect(observedBeforeFinal).toBe(true);expect(progress.mock.calls[0][0].draft).toBe('迎风眯起眼睛。');expect(result.meaning.zh).toBe(wire.meaningZh);expect(config.resolve).toHaveBeenCalledTimes(2);
});
it('does not call a provider after access revocation and does not commit if permission is revoked during generation',async()=>{
 await db.seedEnrichmentJob();const job=(await claimJob(db.prisma,new Date()))!,stream=vi.fn(async function*(){yield {content:JSON.stringify(wire)};});
 config.resolve.mockRejectedValueOnce(new Error('PRIVATE secret config'));
 await expect(createEnrichmentGenerator(db.prisma)(job,new AbortController().signal,async()=>{})).rejects.toMatchObject({code:'UNAVAILABLE'});expect(stream).not.toHaveBeenCalled();
 config.resolve.mockResolvedValueOnce({maxTokens:2048,provider:{stream}}).mockRejectedValueOnce(new Error('PRIVATE'));
 await expect(createEnrichmentGenerator(db.prisma)(job,new AbortController().signal,async()=>{})).rejects.toMatchObject({code:'UNAVAILABLE'});
 expect((await db.prisma.vocabularySense.findFirstOrThrow()).meaningZh).toBe('眯起眼睛看');
});
it('rejects contradictory duplicate meaning keys so streamed and final meanings cannot disagree',async()=>{
 await db.seedEnrichmentJob();const job=(await claimJob(db.prisma,new Date()))!;
 const raw=JSON.stringify(wire).replace('"meaningEn":','"meaningZh":"contradictory final meaning","meaningEn":');
 config.resolve.mockResolvedValue({maxTokens:2048,provider:{stream:async function*(){yield {content:raw};}}});
 await expect(createEnrichmentGenerator(db.prisma)(job,new AbortController().signal,async()=>{})).rejects.toMatchObject({code:'INVALID_OUTPUT'});
});
it('selects only supplied offline dictionary IDs and rejects invented IDs',async()=>{
 await db.seedEnrichmentJob();const job=(await claimJob(db.prisma,new Date()))!;
 let supplied:any[]=[];config.resolve.mockResolvedValue({maxTokens:2048,provider:{stream:async function*(request:any){supplied=JSON.parse(request.userPrompt).dictionaryCandidates;yield {content:JSON.stringify({...wire,selectedDictionarySenseId:supplied[0]?.id??null,uncertain:false})};}}});
 const valid=await createEnrichmentGenerator(db.prisma)(job,new AbortController().signal,async()=>{});expect(supplied.length).toBeGreaterThan(0);expect(valid.selectedDictionarySenseId).toBe(supplied[0].id);
 config.resolve.mockResolvedValue({maxTokens:2048,provider:{stream:async function*(){yield {content:JSON.stringify({...wire,selectedDictionarySenseId:'a'.repeat(64),uncertain:false})};}}});
 await expect(createEnrichmentGenerator(db.prisma)(job,new AbortController().signal,async()=>{})).rejects.toMatchObject({code:'INVALID_OUTPUT'});
});
