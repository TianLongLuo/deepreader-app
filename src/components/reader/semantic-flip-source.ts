import type {SemanticFlipInput} from '@/lib/semantic-flip';
import type {FlipSessionDomain} from './semantic-flip-controller';
import {occurrenceId,type Occurrence} from './source-position';
import {originalRange,projectionFor} from './original-text';
import {cropFlipContext} from './semantic-flip-context';
/** Raw source coordinates never use normalized spelling searches. */
export function sourceRangeAt(root:Node,start:number,end:number):Range{
 const doc=root.ownerDocument!,walk=doc.createTreeWalker(root,4),nodes:Text[]=[];let node:Node|null;while((node=walk.nextNode()))nodes.push(node as Text);
 const point=(offset:number)=>{for(const node of nodes){if(offset<=node.length)return {node,offset};offset-=node.length;}throw new RangeError('Source offset outside prose');};
 const a=point(start),b=point(end),r=doc.createRange();r.setStart(a.node,a.offset);r.setEnd(b.node,b.offset);return r;
}
function prefixOffset(root:Node,r:Range){const prefix=r.cloneRange();prefix.selectNodeContents(root);prefix.setEnd(r.startContainer,r.startOffset);return prefix.toString().length;}
export function pdfOccurrence(selectionKey:string,block:Element,range:Range):Occurrence{
 const r=originalRange(range),canonical=projectionFor(block)?.canonicalNode(block)??block,start=prefixOffset(canonical,r),word=r.toString(),position={kind:'pdf',selectionKey,start,end:start+word.length} as const;
 return {id:occurrenceId(position),position,word,originalRange:r};
}
export function flipInputFor(o:Occurrence,domain:FlipSessionDomain):SemanticFlipInput{
 const range=originalRange(o.originalRange),node=range.startContainer,block=(node.nodeType===1?node as Element:node.parentElement)?.closest('[data-pdf-selection-key],p,li,blockquote,h1,h2,h3,h4,h5,h6,div');
 if(!block||!block.contains(range.endContainer))throw new RangeError('No single original prose block');
 const start=prefixOffset(block,range),word=range.toString();
 return {documentId:domain.documentId,sourceLanguage:domain.sourceLanguage,targetLanguage:domain.targetLanguage,occurrence:o.id,...cropFlipContext({text:block.textContent??'',start,end:start+word.length,previousText:block.previousElementSibling?.textContent??undefined,nextText:block.nextElementSibling?.textContent??undefined})};
}
