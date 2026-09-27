import {Fragment} from 'react';
function inline(text:string){return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part,i)=>part.startsWith('**')?<strong key={i}>{part.slice(2,-2)}</strong>:part.startsWith('*')?<em key={i}>{part.slice(1,-1)}</em>:<Fragment key={i}>{part}</Fragment>);}
export function FormattedText({text}:{text:string}){
 const blocks:{kind:'p'|'ul'|'ol';lines:string[]}[]=[];
 for(const line of text.split('\n')){
  if(!line.trim())continue;
  const kind=/^\s*\d+[.)]\s/.test(line)?'ol':/^\s*[-*]\s/.test(line)?'ul':'p';
  const cleaned=line.replace(/^\s*(?:\d+[.)]|[-*])\s/,'').replace(/^#{1,6}\s/,'');
  if(kind!=='p'&&blocks.at(-1)?.kind===kind)blocks.at(-1)!.lines.push(cleaned);
  else blocks.push({kind,lines:[cleaned]});
 }
 return <div className="space-y-2 text-sm leading-6 [overflow-wrap:anywhere]">{blocks.map((b,i)=>b.kind==='p'?<p key={i}>{inline(b.lines[0])}</p>:b.kind==='ol'?<ol key={i} className="list-decimal space-y-1 pl-5">{b.lines.map((l,j)=><li key={j}>{inline(l)}</li>)}</ol>:<ul key={i} className="list-disc space-y-1 pl-5">{b.lines.map((l,j)=><li key={j}>{inline(l)}</li>)}</ul>)}</div>;
}
