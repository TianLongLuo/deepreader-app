type Point = {node:Text;offset:number};
export type MeaningTextSource = {element:HTMLElement;text:string;points:Point[];ends:Point[]};
const blockedTags=new Set(['SCRIPT','STYLE','NAV','BUTTON','INPUT','TEXTAREA','SELECT','IFRAME','NOSCRIPT','SVG','CANVAS']);
const blockTags=new Set(['BODY','DIV','P','LI','BLOCKQUOTE','DD','DT','FIGCAPTION','SECTION','ARTICLE','MAIN','H1','H2','H3','H4','H5','H6','TD','TH','PRE']);

/** Read the book's existing text only. No wrappers, node splitting or CFI changes. */
export function collectMeaningSources(root:Element):MeaningTextSource[]{
 const doc=root.ownerDocument,win=doc.defaultView;
 const pdfOnly=root.matches('[data-pdf-selection-key]')||Boolean(root.querySelector('[data-pdf-selection-key]'));
 const styles=new Map<Element,CSSStyleDeclaration|null>();
 const style=(el:Element)=>{if(!styles.has(el))styles.set(el,win?.getComputedStyle(el)??null);return styles.get(el);};
 const excluded=(el:Element)=>{
  if(blockedTags.has(el.tagName.toUpperCase())&&!el.matches('button[data-pdf-selection-key]'))return true;
  if(el.hasAttribute('hidden')||el.getAttribute('aria-hidden')==='true'||el.getAttribute('role')==='doc-noteref'||(el.getAttribute('epub:type')??'').split(/\s+/).includes('noteref'))return true;
  const css=style(el);return css?.display==='none'||css?.visibility==='hidden'||css?.visibility==='collapse';
 };
 if(excluded(root))return [];
 const isBlock=(el:Element)=>blockTags.has(el.tagName.toUpperCase())||el.hasAttribute('data-pdf-selection-key')||/^(block|list-item|table-cell|flex|grid|flow-root)$/.test(style(el)?.display??'');
 const ownerOf=(el:Element):HTMLElement=>{let current:Element|null=el;while(current&&current!==root){if(isBlock(current))return current as HTMLElement;current=current.parentElement;}return root as HTMLElement;};
 // FILTER_REJECT prevents descendants of controls/hidden nodes from entering the source.
 const walker=doc.createTreeWalker(root,1|4,{acceptNode:node=>node.nodeType===1&&excluded(node as Element)?2:1});
 const sources:MeaningTextSource[]=[];let current:MeaningTextSource|null=null,pending=false,node:Node|null;
 const flush=()=>{if(current?.text)sources.push(current);current=null;pending=false;};
 while((node=walker.nextNode())){
  if(node.nodeType===1){const el=node as Element;if(isBlock(el))flush();if(el.tagName.toUpperCase()==='BR'&&current?.text)pending=true;continue;}
  const textNode=node as Text,parent=textNode.parentElement;if(!parent)continue;
  if(pdfOnly&&!parent.closest('[data-pdf-selection-key]'))continue;
  const owner=ownerOf(parent);
  if(current&&current.element!==owner)flush();
  if(!current)current={element:owner,text:'',points:[],ends:[]};
  for(let offset=0;offset<textNode.data.length;offset++){
   const char=textNode.data[offset];
   if(/\s/.test(char)){if(current.text)pending=true;continue;}
   if(pending){current.text+=' ';current.points.push(current.ends[current.ends.length-1]);current.ends.push({node:textNode,offset});pending=false;}
   current.text+=char;current.points.push({node:textNode,offset});current.ends.push({node:textNode,offset:offset+1});
  }
 }
 flush();return sources;
}
export function sourceRange(source:MeaningTextSource,start:number,end:number):Range{
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<=start||end>source.text.length)throw new RangeError('Invalid source span');
 const range=source.element.ownerDocument.createRange(),first=source.points[start],last=source.ends[end-1];
 range.setStart(first.node,first.offset);range.setEnd(last.node,last.offset);return range;
}
export function observeMeaningSources(root:Element,changed:()=>void){const observer=new root.ownerDocument.defaultView!.MutationObserver(changed);observer.observe(root,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['hidden','aria-hidden','class','style','role','epub:type']});return observer;}
