import {collectMeaningSources,sourceRange,type MeaningTextSource} from './meaning-text-source';
/** Requested-section source point; never adopt a neighbor's relocation. */
export function epubSourceAnchorRange(within:Element):Range {
 const doc=within.ownerDocument,body=doc.body;
 let source:MeaningTextSource|undefined=collectMeaningSources(within)[0];
 // Empty TOC anchors commonly precede, rather than contain, their prose.
 if(!source&&within!==body)source=collectMeaningSources(body).find(s=>Boolean(within.compareDocumentPosition(s.element)&4));
 if(source){const range=sourceRange(source,0,source.text.length);range.collapse(true);return range;}
 // Covers/fixed-layout pages need a structural source point, not prose.
 const target=within===body?(within.querySelector('img,svg,object,video')??within):within;
 const range=doc.createRange();range.selectNodeContents(target);range.collapse(true);return range;
}

export function epubSourceAnchor(content:{cfiFromRange:(range:Range)=>string;cfiFromNode:(node:Node)=>string},within:Element):string {
 const range=epubSourceAnchorRange(within);
 // EPUBjs fromRange appends a nonexistent text step to element endpoints.
 return range.startContainer.nodeType===3?content.cfiFromRange(range):content.cfiFromNode(range.startContainer);
}
