'use client';
import { useReaderStore } from '@/hooks/use-reader-store';
import { getStudyLanguage, type StudyLanguage } from './study-interaction';
export default function StudyLanguageSelect(){
 const {sourceLanguage,studyLanguages,setStudyLanguage}=useReaderStore();
 return <label className="flex items-center gap-1 text-xs text-muted-foreground"><select aria-label="释义语言" className="max-w-28 rounded-md border-0 bg-transparent px-1 py-1 text-xs" value={getStudyLanguage(sourceLanguage,studyLanguages)} onChange={e=>setStudyLanguage(e.target.value as StudyLanguage)}>
 <option value="en">{sourceLanguage==='es'?'西英释义':'英英释义'}</option>
 {sourceLanguage==='es'&&<option value="es">西西释义</option>}
 <option value="bilingual">{sourceLanguage==='es'?'西中双语':'英中双语'}</option>
 </select></label>;
}
