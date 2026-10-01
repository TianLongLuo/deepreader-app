/** Local browser fixture for the real reader components; never connects to production. */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const require=createRequire(import.meta.url);
const {build}=require('esbuild'),JSZip=require('jszip'),postcss=require('postcss'),tailwind=require('@tailwindcss/postcss');
const root=process.cwd(),output=path.join(root,'.superpowers/sdd/2026-10-01-reader-streaming/browser-fixture');
const arg=process.argv.indexOf('--port'),port=arg<0?3018:Number(process.argv[arg+1]);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Use a local unprivileged port');
await fs.mkdir(output,{recursive:true});
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import ReaderLayout from './src/components/reader/reader-layout';import {useReaderStore} from './src/hooks/use-reader-store';import {useUIPreferences} from './src/hooks/use-ui-preferences';import {collectMeaningSources,sourceRange} from './src/components/reader/meaning-text-source';import {splitMeaningText} from './src/lib/meaning-group-units';
const params=new URLSearchParams(location.search),kind=params.get('kind')==='pdf'?'PDF':'EPUB';
window.qa={collectMeaningSources,sourceRange,splitMeaningText,setTheme(theme){useReaderStore.getState().setTheme(theme);useUIPreferences.getState().setTheme(theme==='dark'?'dark':'light');document.documentElement.classList.toggle('dark',theme==='dark');},store:useReaderStore};
window.qa.setTheme(params.get('theme')||'light');useReaderStore.getState().setMeaningGroupReading(false);
createRoot(document.getElementById('root')).render(<ReaderLayout document={{id:'fixture-'+kind.toLowerCase(),title:'Reader QA — '+kind,fileType:kind,language:'en',pageCount:kind==='PDF'?3:undefined}} currentUser={{id:'fixture-reader',email:'fixture@example.test'}}/>);`;
await build({stdin:{contents:entry,resolveDir:root,sourcefile:'reader-fixture.tsx',loader:'tsx'},outfile:path.join(output,'fixture.js'),bundle:true,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},jsx:'automatic',plugins:[{name:'local-routing-only',setup(b){b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:"import React from 'react';export default function Link({href,prefetch,replace,scroll,...props}){return React.createElement('a',{href,...props});}",resolveDir:root,loader:'js'}));}}],logLevel:'silent'});
const css=await postcss([tailwind({base:root})]).process(await fs.readFile(path.join(root,'src/app/globals.css'),'utf8'),{from:path.join(root,'src/app/globals.css')});
await fs.writeFile(path.join(output,'fixture.css'),css.css+'\nhtml,body,#root{height:100%;margin:0}');
const paragraphs=Array.from({length:42},(_,i)=>`Paragraph ${i+1}. She waited and arrived at the station.`);
const xml=value=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;');
const chapter1=`<h1>Coverage</h1><blockquote>Outside direct text remains part of the book.<p>Inside paragraph is included once.</p>Tail direct text remains visible.</blockquote><div>A div-only passage must be covered too.</div>${paragraphs.map((text,i)=>`<p id="p${i}">${text}</p>`).join('')}<p>She waited <a epub:type="noteref" href="#note">1</a> and arrived.</p><aside id="note" hidden="hidden">Hidden footnote.</aside>`;
const long=('She waited beside the station. He arrived after sunset. ').repeat(130)+'The final tail remains covered.';
const page=body=>`<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>QA fixture</title><style>p{margin:.2em 0}body{padding:0 12px}h1{font-size:1.25em}blockquote{margin:0}div{display:block}</style></head><body>${body}</body></html>`;
const zip=new JSZip();zip.file('mimetype','application/epub+zip',{compression:'STORE'});
zip.file('META-INF/container.xml','<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
zip.file('OEBPS/content.opf','<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">reader-qa-fixture</dc:identifier><dc:title>Reader QA</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">2026-10-01T00:00:00Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" properties="nav" media-type="application/xhtml+xml"/><item id="one" href="one.xhtml" media-type="application/xhtml+xml"/><item id="two" href="two.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="one"/><itemref idref="two"/></spine></package>');
zip.file('OEBPS/nav.xhtml',page('<nav epub:type="toc"><ol><li><a href="one.xhtml">Coverage</a></li><li><a href="two.xhtml">Long tail</a></li></ol></nav>'));
zip.file('OEBPS/one.xhtml',page(chapter1));zip.file('OEBPS/two.xhtml',page(`<h1>Long tail</h1><p id="long">${xml(long)}</p>`));
const epub=await zip.generateAsync({type:'nodebuffer'});await fs.writeFile(path.join(output,'fixture.epub'),epub);
function pdf(){
 const count=3,font=3+count*2,objects=['<< /Type /Catalog /Pages 2 0 R >>',`<< /Type /Pages /Kids [${Array.from({length:count},(_,i)=>`${3+i} 0 R`).join(' ')}] /Count ${count} >>`];
 for(let i=0;i<count;i++)objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${3+count+i} 0 R >>`);
 for(let i=0;i<count;i++){const text='BT /F1 13 Tf 50 730 Td '+paragraphs.slice(i*14,i*14+14).map((p,j)=>(j?'0 -35 Td ':'')+`(${p.replace(/[()\\]/g,'\\$&')}) Tj`).join('\n')+' ET';objects.push(`<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`);}
 objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');let text='%PDF-1.4\n',offsets=[0];objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(text));text+=`${i+1} 0 obj\n${object}\nendobj\n`;});const xref=Buffer.byteLength(text);text+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;return Buffer.from(text);
}
const pdfBytes=pdf(),entries=[];
const stats={meaning:[],reading:0,canceled:0,active:0,maxActive:0,invalid:0};
const json=(res,value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function ndjson(res,value,units=[],answer=''){
 const requestId=randomUUID();res.writeHead(200,{'Content-Type':'application/x-ndjson','Cache-Control':'private, no-store, no-transform','X-Accel-Buffering':'no'});
 let completed=false;stats.active++;stats.maxActive=Math.max(stats.maxActive,stats.active);res.once('close',()=>{stats.active--;if(!completed)stats.canceled++;});
 const emit=event=>{if(!res.destroyed)res.write(JSON.stringify({requestId,...event})+'\n');};emit({type:'start',cached:false});
 for(const [index,prefix] of units.entries()){await delay(90);emit({type:'unit',index:prefix.groups.length-1,value:prefix});}
 if(answer){await delay(90);emit({type:'delta',text:answer.slice(0,Math.floor(answer.length/2))});await delay(600);emit({type:'delta',text:answer.slice(Math.floor(answer.length/2))});}
 await delay(90);if(!res.destroyed){completed=true;emit({type:'complete',value});res.end();}
}
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1'),pathname=url.pathname;
  if(pathname==='/__qa_stats')return json(res,stats);
  if(pathname==='/fixture.js'||pathname==='/fixture.css'){res.writeHead(200,{'Content-Type':pathname.endsWith('.js')?'application/javascript':'text/css'});return res.end(await fs.readFile(path.join(output,path.basename(pathname))));}
  if(pathname.startsWith('/pdfjs/')){const file=path.resolve(root,'public','.'+pathname);if(!file.startsWith(path.join(root,'public/pdfjs/')))return json(res,{},404);res.writeHead(200,{'Content-Type':file.endsWith('.mjs')?'application/javascript':'application/octet-stream'});return res.end(await fs.readFile(file));}
  if(pathname.endsWith('/raw')){const isPdf=pathname.includes('fixture-pdf');res.writeHead(200,{'Content-Type':isPdf?'application/pdf':'application/epub+zip'});return res.end(isPdf?pdfBytes:epub);}
  if(pathname.endsWith('/text'))return json(res,{pageCount:3,paragraphs:paragraphs.map((text,i)=>({id:'p'+i,orderIndex:i,pageNumber:Math.floor(i/14)+1,text}))});
  let body='';for await(const chunk of req){body+=chunk;if(body.length>140000)throw new Error('Fixture body too large');}const input=body?JSON.parse(body):{};
  if(pathname.endsWith('/reading')){if(req.method==='POST'){if(input.kind){const item={id:randomUUID(),...input,createdAt:new Date().toISOString()};entries.push(item);return json(res,{item});}return json(res,{ok:true});}return json(res,{items:entries,progress:null});}
  if(pathname==='/api/dictionary')return json(res,{word:url.searchParams.get('word'),phonetic:'/ˈfɪkstʃə/',meanings:[{partOfSpeech:'noun',definitions:[{definition:'A local QA definition.'}]}],provider:'fixture'});
  if(pathname==='/api/meaning-groups'){
   const text=input.text,groups=Array.from(new Intl.Segmenter(input.sourceLanguage,{granularity:'sentence'}).segment(text)).map(s=>{const phrase=s.segment.trim(),start=s.index+s.segment.indexOf(phrase);return {start,end:start+phrase.length,text:phrase};});
   const verbs=[...text.matchAll(/\b(waited|arrived|remains|is)\b/g)].map(m=>({start:m.index,end:m.index+m[0].length,text:m[0]}));
   const value={text,groups,verbs};stats.meaning.push({length:text.length,text});return ndjson(res,value,groups.map((_,i)=>({text,groups:groups.slice(0,i+1),verbs:verbs.filter(v=>v.end<=groups[i].end)})));
  }
  if(pathname==='/api/reading-assistant'){stats.reading++;return ndjson(res,{answer:'Fixture contextual meaning.',citations:[],provider:'fixture',model:'fixture'},[],'Fixture contextual meaning.');}
  if(pathname==='/api/explain-text'||pathname.endsWith('/explain'))return ndjson(res,{id:'explain-fixture',status:'COMPLETED',cached:false,output:{paragraph_summary:'Fixture paragraph.',plain_meaning:'A local UI test.',sentence_breakdown:[],sentence_roles:[],vocabulary_notes:[],grammar_notes:[],logic_flow:[],who_did_what:[]}},[],'{"paragraph_summary":"Fixture paragraph.","plain_meaning":"A local UI test."}');
  if(pathname.startsWith('/api/'))return json(res,{},404);
  res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
 }catch{stats.invalid++;if(!res.headersSent)json(res,{error:'Local fixture request failed'},500);else res.destroy();}
});
server.listen(port,'127.0.0.1',()=>console.log(`Isolated reader fixture: http://127.0.0.1:${port} (real components, mock API; not model acceptance)`));
for(const event of ['SIGINT','SIGTERM'])process.on(event,()=>server.close(()=>process.exit(0)));
