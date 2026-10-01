import type {SavedEvidence,SourceLanguage,ContextMeaning} from '@/server/vocabulary/types';
import {wordSpans} from '@/components/study/word-display';
const record=(value:unknown):Record<string,unknown>|null=>typeof value==='object'&&value!==null&&!Array.isArray(value)?value as Record<string,unknown>:null;
const string=(value:unknown)=>typeof value==='string'?value:'';
const aiText=(value:unknown)=>string(value)||string(record(value)?.answer);
export function targetSentence(context:string,word:string,language:SourceLanguage){
 if(!context)return '';
 const hasWord=(text:string)=>wordSpans(text,word).some(p=>p.highlight);
 for(const part of new Intl.Segmenter(language,{granularity:'sentence'}).segment(context))if(hasWord(part.segment))return part.segment.trim();
 return context.length>480?context.slice(0,480)+'…':context.trim();
}
/** Known saved fields only. Unknown/malformed input remains byte-for-byte raw evidence. */
export function parseSavedWord(note:string,text:string):SavedEvidence{
 let data:Record<string,unknown>|null=null;try{data=record(JSON.parse(note));}catch{}
 const sourceLanguage:SourceLanguage=data?.sourceLanguage==='es'?'es':'en';
 const marked=record(data?.contextMeaning),meaning:ContextMeaning={};
 if(string(marked?.en))meaning.en=string(marked?.en);
 if(string(marked?.zh))meaning.zh=string(marked?.zh);
 const context=string(data?.context)||string(data?.contextText);
 const dictionary:Record<string,unknown>={};
 for(const key of ['meanings','phonetic','audioUrl','provider','definitionLanguage','attribution','source','sourceUrl','licenseUrl'])if(data&&key in data)dictionary[key]=data[key];
 return {rawNote:note,context,targetSentence:targetSentence(context,text,sourceLanguage),phonetic:string(data?.phonetic),sourceLanguage,meaning,legacyContextMeaning:aiText(data?.aiExplanation)||aiText(data?.aiMeaning),dictionary:Object.keys(dictionary).length?dictionary:null,legacyReviewAt:null,legacyReviewCount:0};
}
