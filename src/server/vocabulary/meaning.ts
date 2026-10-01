import type {MeaningLanguage} from './types';
type Meanings={meaningEn:string;meaningZh:string;manualMeaningEn:string|null;manualMeaningZh:string|null};
export function contextualMeaning(sense:Meanings,legacy:string,language:MeaningLanguage){
 const values={en:sense.manualMeaningEn??sense.meaningEn,zh:sense.manualMeaningZh??sense.meaningZh},other=language==='zh'?'en':'zh';
 if(values[language])return {meaning:values[language],definitionLanguage:language,fallback:false};
 if(values[other])return {meaning:values[other],definitionLanguage:other,fallback:true};
 return {meaning:legacy,definitionLanguage:'legacy' as const,fallback:Boolean(legacy)};
}
