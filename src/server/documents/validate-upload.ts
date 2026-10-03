import { CompatibleEPub } from '../parsing/compatible-epub';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

/** Validate before persisting: magic bytes alone do not make a readable book. */
export async function validateUpload(buffer:Buffer,type:'PDF'|'EPUB') {
 if(type==='PDF'){
  // pdf-parse uses the existing server pdf.js runtime; no rendering or AI calls.
  const {PDFParse}=require('pdf-parse') as typeof import('pdf-parse');
  const parser=new PDFParse({data:buffer});
  try{const info=await parser.getInfo();if(info.total<1)throw Error('PDF has no pages');}
  finally{await parser.destroy().catch(()=>{});}
 }else{
  const dir=await mkdtemp(join(tmpdir(),'deepreader-validate-'));
  try{const path=join(dir,'book.epub');await writeFile(path,buffer);const book=await CompatibleEPub.createAsync(path);if(!book.flow?.length)throw Error('EPUB has no spine');for(const chapter of book.flow){if(!chapter.id)throw Error('EPUB spine is incomplete');await book.getChapterRawAsync(chapter.id);}}
  finally{await rm(dir,{recursive:true,force:true});}
 }
}
