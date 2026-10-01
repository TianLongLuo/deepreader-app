/** Loopback-only, real study components and real temporary SQLite services; no model or production data. */
import http from 'node:http';
import assert from 'node:assert/strict';
import type {ReadingEntry} from '@prisma/client';
import fs from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import {createVocabularyDB} from '../../tests/helpers/vocabulary-db';
import {createVocabularyService,VocabularyError} from '../../src/server/vocabulary/service';
import {createPracticeService} from '../../src/server/practice/service';
import {createPracticeFeedback} from '../../src/server/practice/feedback';
import {createSenseService} from '../../src/server/vocabulary/senses';
import {createEnrichmentJobs,claimJob} from '../../src/server/vocabulary/jobs';
import {migrateSavedWords} from '../../src/server/vocabulary/migration';
import {aiConfigResolver} from '../../src/server/ai/config-resolver';
import {aiStreamResponse} from '../../src/server/ai/stream-response';
import {createReviewService} from '../../src/server/review/service';
async function main(){
const root=process.cwd(),output=path.join(root,'.superpowers/sdd/2026-10-01-learning-practice/browser-fixture'),port=3020;
await fs.mkdir(output,{recursive:true});
await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import StudyLibrary from './src/components/study/study-library';window.qa={setTheme(theme){document.documentElement.classList.toggle('dark',theme==='dark');}};createRoot(document.getElementById('root')).render(<StudyLibrary/>);`,resolveDir:root,loader:'tsx',sourcefile:'study-fixture.tsx'},outfile:path.join(output,'fixture.js'),bundle:true,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'local-links',setup(b){b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:"import React from 'react';export default function Link({href,prefetch,replace,scroll,...props}){return React.createElement('a',{href,...props});}",resolveDir:root,loader:'js'}));}}],logLevel:'silent'});
const css=await postcss([tailwind({base:root})]).process(await fs.readFile(path.join(root,'src/app/globals.css'),'utf8'),{from:path.join(root,'src/app/globals.css')});await fs.writeFile(path.join(output,'fixture.css'),css.css);
const db=await createVocabularyDB(),service=createVocabularyService(db.prisma),review=createReviewService(db.prisma);
const legacyBefore:ReadingEntry[]=[];
for(const [word,language,meaning,sentence,domain] of [
 ['squint','en','眯起眼睛看','I squint against the wind.','daily.body.visual'],
 ['allocate','en','分配预算','We allocated money to the campaign.','work.marketing.ads'],
 ['budget','en','可用预算','Our budget is limited.','work.marketing.ads'],
 ['campaign','en','营销活动','We planned a new campaign.','work.marketing.ads'],
 ['presupuesto','es','预算','El presupuesto es limitado.','work.marketing.ads'],
 ['campaña','es','营销活动','Organizamos una campaña.','work.marketing.ads'],
 ['occasion','en','特定场合','She chose the dress for the occasion.','daily.social.relationships'],
 ['negociar','es','协商；谈判','Necesitamos negociar un precio mejor.','work.marketing.ads']
]){const entry=await db.seedWord({text:word,location:'epubcfi(/'+word+')',note:JSON.stringify({context:sentence,contextMeaning:{zh:meaning,en:'A short contextual meaning for '+word},sourceLanguage:language,phonetic:'/ˈfɪkstʃə/',attribution:'Local QA fixture dictionary',licenseUrl:'https://example.test/license'})});legacyBefore.push(entry);await migrateSavedWords(db.prisma,db.scope);const encounter=await db.prisma.vocabularyEncounter.findUniqueOrThrow({where:{readingEntryId:entry.id}});const saved={senseId:encounter.senseId};await db.prisma.vocabularySense.update({where:{id:saved.senseId},data:{domain,pos:language==='es'?'verb':'verb',collocationsJson:JSON.stringify([word+' in context',word+' naturally'])}});}
for(const entry of legacyBefore)assert.deepEqual(await db.prisma.readingEntry.findUnique({where:{id:entry.id}}),entry);
await migrateSavedWords(db.prisma);assert.equal(await db.prisma.vocabularyEncounter.count(),legacyBefore.length);
console.log(JSON.stringify({legacyMigrationPreserved:true,idempotent:true}));
for(const kind of ['note','bookmark','chat'])await db.seedWord({kind,text:kind==='note'?'Reading idea':kind==='bookmark'?'Chapter one':'A saved conversation',note:kind==='chat'?JSON.stringify({answer:{answer:'Saved AI answer'},history:[{role:'user',content:'Why?'}]}):'Original personal note'});
const practice=createPracticeService(db.prisma),feedback=createPracticeFeedback(db.prisma),senses=createSenseService(db.prisma),jobs=createEnrichmentJobs(db.prisma);
const workerStop=new AbortController();let fault='',workerActive=true,workerBusy=false;
// Deterministic loopback provider is ONLY transport/UI evidence, never real-model acceptance.
aiConfigResolver.resolve=async()=>({maxTokens:4096,provider:{complete:async()=>{throw new Error('Fixture never uses complete');},stream:async function*(request:any){
 const input=JSON.parse(request.userPrompt);let value:any;
 if(request.systemPrompt.includes('independent semantic'))value={valid:true,targets:input.targets.map((t:any)=>({senseId:t.senseId,correct:true,surface:t.lemma==='allocate'?'allocated':t.lemma})),questionsGrounded:true,applicationAppropriate:true};
 else if(request.systemPrompt.includes('Give concise language practice feedback'))value={summary:'意思表达清楚了。先练习自然的预算搭配。',priorityIssue:'分配预算时，把目标活动说清楚。',naturalExpression:input.sourceLanguage==='es'?'Necesitamos negociar un presupuesto para la campaña.':'We allocated the budget to the campaign.',retryPrompt:'换一个活动，再说一句你如何分配预算。',extraProblems:[],targets:input.applicationTargets.map((t:any)=>({senseId:t.senseId,meaningCorrect:true,collocationNatural:true,formCorrect:true,reason:'Fits the selected scenario.'})),answers:input.questions.map((q:any)=>({questionId:q.id,correct:true,reason:'Supported by the passage.'}))};
 else if(request.systemPrompt.includes('You enrich'))value={meaningZh:'本句中的简短含义。',meaningEn:'A concise meaning in this sentence.',lemma:input.word,selectedDictionarySenseId:null,pos:input.word==='allocate'||input.word==='negociar'||input.word==='squint'?'verb':'noun',semanticCategory:input.word==='allocate'||input.word==='negociar'?'action':input.word==='squint'?'perception':'abstract',domain:input.word==='squint'?'daily.body.visual':input.word==='occasion'?'daily.social.relationships':'work.marketing.ads',contextTags:['office'],collocations:['a clear context','a useful phrase'],uncertain:true};
 else {const es=input.sourceLanguage==='es',first=es?'Necesitamos negociar el presupuesto de la campaña.':'We allocated the budget to the campaign.',sentence=es?'El equipo revisó el plan antes de empezar.':'The team reviewed the plan before starting.',passage=first+' '+Array.from({length:Math.ceil((input.wordCount??250)/8)-1},()=>sentence).join(' ');value={passage:input.mode==='application'?'':passage,questions:input.mode==='application'?[]:[{id:'q1',question:'What was planned?',answer:'A campaign.',quote:first},{id:'q2',question:'What did the team review?',answer:'The plan.',quote:sentence}],applicationPrompt:es?'Explica cómo negociar un presupuesto para una campaña.':'Tell a colleague how to allocate the budget to a campaign.'};}
 const raw=JSON.stringify(value);for(let i=0;i<raw.length;i+=35){request.signal?.throwIfAborted();if(fault==='interrupt'&&i>70){fault='';throw new Error('Fixture interrupted');}yield {content:raw.slice(i,i+35)};await new Promise(r=>setTimeout(r,15));}
 }}} as any);
const worker=setInterval(()=>{if(!workerActive||workerBusy)return;workerBusy=true;void(async()=>{const job=await claimJob(db.prisma,new Date());if(job)await jobs.runJob(job,workerStop.signal);})().finally(()=>{workerBusy=false;});},300);
async function stream(res:http.ServerResponse,generate:(signal:AbortSignal)=>AsyncIterable<any>){const stop=new AbortController();res.once('close',()=>{if(!res.writableEnded)stop.abort();});const response=aiStreamResponse(stop.signal,generate);res.writeHead(response.status,Object.fromEntries(response.headers));const reader=response.body!.getReader();try{for(;;){const part=await reader.read();if(part.done||stop.signal.aborted)break;res.write(part.value);}}catch{}finally{await reader.cancel().catch(()=>{});res.end();}}
const requests:Array<{path:string;method:string}>=[];
const json=(res:http.ServerResponse,value:unknown,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'private, no-store'});res.end(JSON.stringify(value));};
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url!,'http://127.0.0.1'),pathname=url.pathname;requests.push({path:pathname,method:req.method!});
 if(pathname==='/fixture.js'||pathname==='/fixture.css'){res.writeHead(200,{'Content-Type':pathname.endsWith('.js')?'application/javascript':'text/css'});res.end(await fs.readFile(path.join(output,path.basename(pathname))));return;}
 if(pathname==='/__qa_state'){return json(res,{requests,practiceEvidence:await db.prisma.learningEvidence.groupBy({by:['kind'],_count:true}),tasks:await db.prisma.learningTask.findMany({select:{id:true,status:true}}),jobs:await db.prisma.enrichmentJob.findMany({select:{status:true,attempts:true,errorCode:true,availableAt:true}}),logs:await db.prisma.reviewLog.count(),cards:await db.prisma.reviewCard.findMany({select:{version:true,due:true}})});}
 if(pathname==='/__qa_fault'){fault=url.searchParams.get('mode')||'';return json(res,{fault});}
 if(pathname==='/__qa_worker'){workerActive=url.searchParams.get('active')!=='0';return json(res,{workerActive});}
 if(pathname==='/__qa_capture'){const entry=await db.seedWord({text:'newword',note:JSON.stringify({context:'A newword in context.',contextMeaning:{zh:'刚收藏的语境词'}})});return json(res,await service.capture(db.scope,entry));}
 let raw='';for await(const part of req){raw+=part;if(raw.length>16000)throw new VocabularyError('Too large',413);}const body=raw?JSON.parse(raw):{};
 if(pathname==='/api/study/practice'){
  if(fault==='429'&&req.method==='POST'){fault='';return json(res,{error:'Fixture rate limited'},429);}
  if(req.method==='POST')return stream(res,signal=>practice.streamPractice(db.scope,body,signal));
  if(url.searchParams.get('preview')==='1'){const raw=Object.fromEntries(url.searchParams);delete raw.preview;const result=await practice.selectPracticeTargets(db.scope,{...raw,targetCount:Number(raw.targetCount),...(raw.wordCount?{wordCount:Number(raw.wordCount)}:{})});return json(res,{targets:result.targets.map(t=>({senseId:t.senseId,lemma:t.lemma})),deferred:result.deferred});}
  const rows=await db.prisma.learningTask.findMany({where:db.scope,orderBy:{createdAt:'desc'},take:20});return json(res,{items:await Promise.all(rows.map(row=>practice.getPractice(db.scope,row.id)))});
 }
 if(pathname.startsWith('/api/study/practice/')){const parts=pathname.split('/'),id=decodeURIComponent(parts[4]);if(parts[5]==='hint')return json(res,await feedback.hint(db.scope,id));if(parts[5]==='answer'){if(req.method==='GET')return json(res,await feedback.latestResponse(db.scope,id));if(req.method==='PATCH')return json(res,await feedback.dispute(db.scope,id,body.responseId));return stream(res,signal=>feedback.streamFeedback(db.scope,id,body,signal));}if(req.method==='POST')return body.action==='read'?json(res,await practice.markRead(db.scope,id)):stream(res,signal=>practice.streamPractice(db.scope,{},signal,id));return json(res,await practice.getPractice(db.scope,id));}
 if(pathname==='/api/study/vocabulary/senses'){if(req.method==='POST')return json(res,body.action==='merge'?await senses.merge(db.scope,body.sourceIds,body.targetId):body.action==='split'?await senses.split(db.scope,body.senseId,body.encounterIds):await senses.confirm(db.scope,body.senseId,body.dictionarySenseId,body.revision));const id=url.searchParams.get('senseId')!,sense=await db.prisma.vocabularySense.findUniqueOrThrow({where:{id}});return json(res,{revision:sense.revision,selectedDictionarySenseId:sense.confirmedDictionaryId,candidates:await senses.candidates(sense.lemma,sense.sourceLanguage as 'en'|'es'),changes:await senses.history(db.scope,id)});}
 if(pathname.endsWith('/enrichment')){const id=decodeURIComponent(pathname.split('/')[4]);if(req.method==='POST'){await jobs.retry(db.scope,id);return json(res,await jobs.status(db.scope,id));}return req.headers.accept?.includes('application/x-ndjson')?stream(res,signal=>jobs.subscribe(db.scope,id,signal)):json(res,await jobs.status(db.scope,id));}
 if(pathname==='/api/study/vocabulary')return json(res,await service.list(db.scope,Object.fromEntries(url.searchParams)));
 if(pathname.startsWith('/api/study/vocabulary/')){const id=decodeURIComponent(pathname.split('/').at(-1)!);return json(res,req.method==='PATCH'?await service.edit(db.scope,id,body):req.method==='DELETE'?await service.remove(db.scope,id):await service.detail(db.scope,id,url.searchParams.get('definitionLanguage')==='en'?'en':'zh'));}
 if(pathname==='/api/study/review')return json(res,{front:await review.front(db.scope,url.searchParams.get('definitionLanguage')==='en'?'en':'zh',(url.searchParams.get('sourceLanguage')||undefined) as 'en'|'es'|undefined),...await review.summary(db.scope)});
 if(pathname==='/api/study/review/reveal')return json(res,await review.reveal(db.scope,body.sessionId));
 if(pathname==='/api/study/review/rate')return json(res,await review.rate(db.scope,body));
 if(pathname==='/api/study'){if(req.method==='DELETE'){await db.prisma.readingEntry.deleteMany({where:{id:url.searchParams.get('entryId')!,userId:db.scope.userId}});return json(res,{success:true});}return json(res,{items:await db.prisma.readingEntry.findMany({where:{userId:db.scope.userId,kind:{not:'word'}},include:{document:{select:{id:true,title:true}}}})});}
 if(pathname.startsWith('/api/'))return json(res,{},404);
 res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
}catch(error){json(res,{error:error instanceof VocabularyError?error.message:'Local fixture failure'},error instanceof VocabularyError?error.status:500);}});
server.listen(port,'127.0.0.1',()=>console.log('Isolated workbench fixture: http://127.0.0.1:3020 (real SQLite/services, fixture owner; not production auth/model acceptance)'));
for(const event of ['SIGINT','SIGTERM'])process.on(event,()=>{clearInterval(worker);workerStop.abort();server.close(()=>{void db.close().then(()=>process.exit(0));});});

}
void main().catch(()=>{console.error("Local fixture startup failed");process.exitCode=1;});
