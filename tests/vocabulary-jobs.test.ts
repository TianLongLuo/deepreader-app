import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {EnrichmentResult} from '@/lib/vocabulary-taxonomy';
import {createVocabularyDB} from './helpers/vocabulary-db';
import {claimJob,createEnrichmentJobs} from '@/server/vocabulary/jobs';
import {createVocabularyService} from '@/server/vocabulary/service';
const result:EnrichmentResult={lemma:'squint',selectedDictionarySenseId:null,meaning:{en:'Narrow your eyes.',zh:'眯起眼睛。'},pos:'verb',semanticCategory:'perception',domain:'daily.body.visual',contextTags:['outdoors'],collocations:['squint at a screen','squint in sunlight'],uncertain:true};
let db:Awaited<ReturnType<typeof createVocabularyDB>>;
beforeEach(async()=>{db=await createVocabularyDB();});afterEach(async()=>{await db?.close();});
it('captures atomically without calling a model and claims one global active job',async()=>{
 await db.seedEnrichmentJob();await db.seedEnrichmentJob();
 const jobs=await Promise.all([claimJob(db.prisma,new Date()),claimJob(db.prisma,new Date())]);expect(jobs.filter(Boolean)).toHaveLength(1);
 expect(await db.prisma.vocabularyEncounter.count()).toBe(2);expect(await db.prisma.enrichmentJob.count()).toBe(2);
});
it('recovers an expired lease and fences the old worker from progress and results',async()=>{
 await db.seedEnrichmentJob();const old=(await claimJob(db.prisma,new Date('2030-01-01')))!;
 const jobs=createEnrichmentJobs(db.prisma);const current=(await claimJob(db.prisma,new Date('2030-01-01T00:02:01Z')))!;
 expect(current.leaseToken).not.toBe(old.leaseToken);expect(current.attempts).toBe(2);
 await expect(jobs.progress(old,{draft:'stale',stage:'generating'},new Date('2030-01-01T00:02:02Z'))).rejects.toMatchObject({status:409});
});
it('stores only sanitized failures, keeps the saved word, and stops after three automatic retries',async()=>{
 await db.seedEnrichmentJob();const generate=vi.fn(async()=>{throw new Error('SECRET provider key and book contents');});
 const jobs=createEnrichmentJobs(db.prisma,{generate});
 for(let attempt=0;attempt<4;attempt++){
  const job=(await claimJob(db.prisma,new Date()))!;expect(job).toBeTruthy();await jobs.runJob(job,new AbortController().signal);
  if(attempt<3)await db.prisma.enrichmentJob.update({where:{id:job.id},data:{availableAt:new Date(0)}});
 }
 const job=await db.prisma.enrichmentJob.findFirstOrThrow();expect(job.status).toBe('failed');expect(job.attempts).toBe(4);expect(job.errorCode).toBe('FAILED');expect(JSON.stringify(job)).not.toContain('SECRET');
 expect(await claimJob(db.prisma,new Date())).toBeNull();expect(await db.prisma.readingEntry.count()).toBe(1);
});
it('preserves manual edits when a job revision becomes stale and supports scoped explicit retry',async()=>{
 const saved=await db.seedEnrichmentJob();const job=(await claimJob(db.prisma,new Date()))!;
 await createVocabularyService(db.prisma).edit(db.scope,saved.id,{revision:saved.revision,manualMeaning:{zh:'人工'}});
 const jobs=createEnrichmentJobs(db.prisma,{generate:async()=>result});await jobs.runJob(job,new AbortController().signal);
 expect((await db.prisma.vocabularySense.findUniqueOrThrow({where:{id:saved.id}})).manualMeaningZh).toBe('人工');
 expect((await db.prisma.enrichmentJob.findFirstOrThrow()).errorCode).toBe('REVISION_CONFLICT');
 await expect(jobs.retry({userId:'other-user',workspaceId:'other-workspace'},saved.id)).rejects.toMatchObject({status:404});
 const retried=await jobs.retry(db.scope,saved.id);expect(retried.expectedRevision).toBe(1);expect(retried.status).toBe('queued');
});
it('commits validated suggestions only through the scoped live lease',async()=>{
 const sense=await db.seedEnrichmentJob();const job=(await claimJob(db.prisma,new Date()))!;
 const jobs=createEnrichmentJobs(db.prisma,{generate:async(_job,signal,progress)=>{await progress({draft:'眯起',stage:'generating'});signal.throwIfAborted();return result;}});await jobs.runJob(job,new AbortController().signal);
 const saved=await db.prisma.vocabularySense.findUniqueOrThrow({where:{id:sense.id}});expect(saved.meaningZh).toBe(result.meaning.zh);expect(saved.domain).toBe('daily.body.visual');expect(saved.status).toBe('unresolved');
 expect((await jobs.status(db.scope,sense.id)).status).toBe('complete');
 await expect(createVocabularyService(db.prisma).applySuggestion(db.scope,sense.id,saved.revision,{meaningZh:'forged'})).rejects.toMatchObject({status:403});
});
it('aborting a progress subscriber never cancels the durable job',async()=>{
 const sense=await db.seedEnrichmentJob(),jobs=createEnrichmentJobs(db.prisma),abort=new AbortController();
 const stream=jobs.subscribe(db.scope,sense.id,abort.signal)[Symbol.asyncIterator]();expect((await stream.next()).value.type).toBe('start');abort.abort();await expect(stream.next()).rejects.toMatchObject({name:'AbortError'});
 expect((await db.prisma.enrichmentJob.findFirstOrThrow()).status).toBe('queued');
});
it('throttles persisted drafts and releases a lease on shutdown even when a generator is stalled',async()=>{
 const sense=await db.seedEnrichmentJob(),job=(await claimJob(db.prisma,new Date()))!,jobs=createEnrichmentJobs(db.prisma);
 const now=new Date();await jobs.progress(job,{draft:'a',stage:'generating'},now);await jobs.progress(job,{draft:'b',stage:'generating'},new Date(now.getTime()+100));
 expect((await jobs.status(db.scope,sense.id)).progress.draft).toBe('a');await jobs.progress(job,{draft:'b',stage:'generating'},new Date(now.getTime()+300));expect((await jobs.status(db.scope,sense.id)).progress.draft).toBe('b');
 const abort=new AbortController(),stalled=createEnrichmentJobs(db.prisma,{generate:()=>new Promise(()=>{})});const running=stalled.runJob(job,abort.signal);abort.abort();await running;
 const saved=await db.prisma.enrichmentJob.findUniqueOrThrow({where:{id:job.id}});expect(saved.status).toBe('queued');expect(saved.leaseToken).toBeNull();expect(saved.attempts).toBe(0);
});
it('rolls back capture links and cards if persistent enqueue fails, without altering the original word',async()=>{
 const word=await db.seedWord();await db.prisma.$executeRawUnsafe("CREATE TRIGGER reject_fixture_job BEFORE INSERT ON enrichment_jobs BEGIN SELECT RAISE(ABORT, 'fixture enqueue failure'); END");
 await expect(createVocabularyService(db.prisma).capture(db.scope,word)).rejects.toThrow();expect(await db.prisma.vocabularySense.count()).toBe(0);expect(await db.prisma.vocabularyEncounter.count()).toBe(0);expect(await db.prisma.reviewCard.count()).toBe(0);expect(await db.prisma.readingEntry.findUnique({where:{id:word.id}})).toEqual(word);
});
