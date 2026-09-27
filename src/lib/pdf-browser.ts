import { reflowPdfPage } from '@/server/parsing/pdf-reflow';
export async function loadPdfLibrary() {
 const pdf = await import('pdfjs-dist/build/pdf.mjs');
 pdf.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
 return pdf;
}
export const pdfResourceOptions = { cMapUrl: '/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdfjs/standard_fonts/' };
export async function extractPdfForUpload(file: File) {
 const pdf = await loadPdfLibrary();
 const task = pdf.getDocument({data: new Uint8Array(await file.arrayBuffer()), ...pdfResourceOptions, isEvalSupported:false});
 try {
  const book = await task.promise;
  const paragraphs = []; let characters=0;
  for(let n=1;n<=book.numPages;n++) {
   const page=await book.getPage(n);
   try {
    const content=await page.getTextContent();
    const runs=content.items.filter((item): item is import('pdfjs-dist/types/src/display/api').TextItem => 'str' in item);
    const text=reflowPdfPage(runs) ?? runs.map(item=>item.str).join(' ').replace(/\s+/g,' ').trim();
    if(!text.trim())continue;
    characters+=text.length;
    if(characters>5_000_000)throw new Error('PDF 正文过长，请分册上传（每册最多 500 万字符）。');
    paragraphs.push({id:'pdf-p-'+paragraphs.length,orderIndex:paragraphs.length,pageNumber:n,text,analysisText:text.replace(/\s+/g,' ').trim()});
   } finally {page.cleanup();}
  }
  if(!paragraphs.length)throw new Error('不支持扫描版 PDF，请上传包含可选择文字的 PDF 或 EPUB。');
  return {title:file.name,pageCount:book.numPages,paragraphs};
 } finally {await task.destroy();}
}
