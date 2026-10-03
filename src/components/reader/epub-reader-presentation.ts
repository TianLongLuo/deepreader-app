import type {ReadingFlow} from './reading-flow';

// Keep the empty navigation gutter outside the iframe and give phone prose more room.
export const epubReaderGutter='clamp(12px, 3vw, 50px)';
export const compactEpubCss=`
  html[data-reader-compact='true'] p,
  html[data-reader-compact='true'] li,
  html[data-reader-compact='true'] blockquote,
  html[data-reader-compact='true'] dd {
    text-align:start !important;
    word-spacing:normal !important;
    letter-spacing:normal !important;
  }
  html[data-reader-compact='true'][data-reader-flow='vertical'] body {
    padding-inline:20px !important;
  }
`;

/** An EPUB pagination iframe can span a whole chapter; use the outer viewport, not its width. */
export function installCompactEpubPresentation(doc:Document,viewport:Window,flow:ReadingFlow):()=>void{
 const root=doc.documentElement;
 const update=()=>{root.dataset.readerCompact=String(viewport.innerWidth<=600);};
 root.dataset.readerFlow=flow;update();viewport.addEventListener('resize',update);
 return ()=>{viewport.removeEventListener('resize',update);delete root.dataset.readerCompact;delete root.dataset.readerFlow;};
}
