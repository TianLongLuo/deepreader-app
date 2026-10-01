/** Loopback-only, real study components and real temporary SQLite services; no model or production data. */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import {createVocabularyDB} from '../../tests/helpers/vocabulary-db';
import {createVocabularyService,VocabularyError} from '../../src/server/vocabulary/service';
import {createReviewService} from '../../src/server/review/service';
async function main(){
const root=process.cwd(),output=path.join(root,'.superpowers/sdd/2026-10-01-vocabulary-review/browser-fixture'),port=3019;
await fs.mkdir(output,{recursive:true});
await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import StudyLibrary from './src/components/study/study-library';window.qa={setTheme(theme){document.documentElement.classList.toggle('dark',theme==='dark');}};createRoot(document.getElementById('root')).render(<StudyLibrary/>);`,resolveDir:root,loader:'tsx',sourcefile:'study-fixture.tsx'},outfile:path.join(output,'fixture.js'),bundle:true,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'local-links',setup(b){b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:"import React from 'react';export default function Link({href,prefetch,replace,scroll,...props}){return React.createElement('a',{href,...props});}",resolveDir:root,loader:'js'}));}}],logLevel:'silent'});
const css=await postcss([tailwind({base:root})]).process(await fs.readFile(path.join(root,'src/app/globals.css'),'utf8'),{from:path.join(root,'src/app/globals.css')});await fs.writeFile(path.join(output,'fixture.css'),css.css);
const db=await createVocabularyDB(),service=createVocabularyService(db.prisma),review=createReviewService(db.prisma);
for(const [word,language,meaning,sentence,domain] of [
 ['squint','en','眯起眼睛看','I squint against the wind.','daily.body.visual'],
 ['allocate','en','分配（预算或资源）','We allocate more money to the campaign.','work.management.budget'],
 ['occasion','en','特定场合','She chose the dress for the occasion.','daily.social.relationships'],
 ['negociar','es','协商；谈判','Necesitamos negociar un precio mejor.','work.collaboration.meeting']
]){const entry=await db.seedWord({text:word,location:'epubcfi(/'+word+')',note:JSON.stringify({context:sentence,contextMeaning:{zh:meaning,en:'A short contextual meaning for '+word},sourceLanguage:language,phonetic:'/ˈfɪkstʃə/',attribution:'Local QA fixture dictionary',licenseUrl:'https://example.test/license'})});const saved=await service.capture(db.scope,entry);await db.prisma.vocabularySense.update({where:{id:saved.senseId},data:{domain,pos:language==='es'?'verb':'verb',collocationsJson:JSON.stringify([word+' in context',word+' naturally'])}});}
for(const kind of ['note','bookmark','chat'])await db.seedWord({kind,text:kind==='note'?'Reading idea':kind==='bookmark'?'Chapter one':'A saved conversation',note:kind==='chat'?JSON.stringify({answer:{answer:'Saved AI answer'},history:[{role:'user',content:'Why?'}]}):'Original personal note'});
const requests:Array<{path:string;method:string}>=[];
const json=(res:http.ServerResponse,value:unknown,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'private, no-store'});res.end(JSON.stringify(value));};
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url!,'http://127.0.0.1'),pathname=url.pathname;requests.push({path:pathname,method:req.method!});
 if(pathname==='/fixture.js'||pathname==='/fixture.css'){res.writeHead(200,{'Content-Type':pathname.endsWith('.js')?'application/javascript':'text/css'});res.end(await fs.readFile(path.join(output,path.basename(pathname))));return;}
 if(pathname==='/__qa_state'){return json(res,{requests,logs:await db.prisma.reviewLog.count(),cards:await db.prisma.reviewCard.findMany({select:{version:true,due:true}})});}
 if(pathname==='/__qa_capture'){const entry=await db.seedWord({text:'newword',note:JSON.stringify({context:'A newword in context.',contextMeaning:{zh:'刚收藏的语境词'}})});return json(res,await service.capture(db.scope,entry));}
 let raw='';for await(const part of req){raw+=part;if(raw.length>16000)throw new VocabularyError('Too large',413);}const body=raw?JSON.parse(raw):{};
 if(pathname==='/api/study/vocabulary')return json(res,await service.list(db.scope,Object.fromEntries(url.searchParams)));
 if(pathname.startsWith('/api/study/vocabulary/')){const id=decodeURIComponent(pathname.split('/').at(-1)!);return json(res,req.method==='PATCH'?await service.edit(db.scope,id,body):req.method==='DELETE'?await service.remove(db.scope,id):await service.detail(db.scope,id,url.searchParams.get('definitionLanguage')==='en'?'en':'zh'));}
 if(pathname==='/api/study/review')return json(res,{front:await review.front(db.scope,url.searchParams.get('definitionLanguage')==='en'?'en':'zh',(url.searchParams.get('sourceLanguage')||undefined) as 'en'|'es'|undefined),...await review.summary(db.scope)});
 if(pathname==='/api/study/review/reveal')return json(res,await review.reveal(db.scope,body.sessionId));
 if(pathname==='/api/study/review/rate')return json(res,await review.rate(db.scope,body));
 if(pathname==='/api/study'){if(req.method==='DELETE'){await db.prisma.readingEntry.deleteMany({where:{id:url.searchParams.get('entryId')!,userId:db.scope.userId}});return json(res,{success:true});}return json(res,{items:await db.prisma.readingEntry.findMany({where:{userId:db.scope.userId,kind:{not:'word'}},include:{document:{select:{id:true,title:true}}}})});}
 if(pathname.startsWith('/api/'))return json(res,{},404);
 res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
}catch(error){json(res,{error:error instanceof VocabularyError?error.message:'Local fixture failure'},error instanceof VocabularyError?error.status:500);}});
server.listen(port,'127.0.0.1',()=>console.log('Isolated workbench fixture: http://127.0.0.1:3019 (real SQLite/services, fixture owner; not production auth/model acceptance)'));
for(const event of ['SIGINT','SIGTERM'])process.on(event,()=>server.close(()=>{void db.close().then(()=>process.exit(0));}));

}
void main().catch(()=>{console.error("Local fixture startup failed");process.exitCode=1;});
