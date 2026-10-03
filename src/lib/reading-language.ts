/** Lookup language is a closed preference, not a provider instruction from user data. */
type LookupLanguageInput={sourceLanguage?:'en'|'es';mode:string;definitionMode?:'bilingual'|'monolingual';language:string;targetWord?:string;text:string;previousText?:string;nextText?:string};
export type ReadingExplanationLanguage='zh'|'en'|'es';
export function readingExplanationLanguage(input:LookupLanguageInput):ReadingExplanationLanguage|null{
 if(input.mode!=='word'&&!(input.mode==='ask'&&input.definitionMode))return null;
 if(input.definitionMode==='bilingual')return 'zh';
 const language=input.language.trim().toLocaleLowerCase();
 if(['chinese','中文','汉语','zh','zh-cn','zh-hans','zh-tw','zh-hant'].includes(language))return 'zh';
 if(['spanish','es','español','西语','西班牙语'].includes(language))return 'es';
 return 'en';
}
export const explanationLanguageNames={zh:'Chinese',en:'English',es:'Spanish'} as const;
const spanishWords=new Set(['el','la','los','las','que','esta','este','aquí','se','refiere','al','una','del','para','significa']);
const englishWords=new Set(['the','this','that','which','here','means','refers','for','with','from','it','is','its']);
const quotedSource=/“([^”\n]+)”|"([^"\n]+)"|`([^`\n]+)`|(?<![\p{L}\p{M}])'([^'\n]+)'(?![\p{L}\p{M}])|‘([^’\n]+)’/gu;
const exampleLabel=String.raw`(?:例句|自编例句|Example(?: sentence)?|Ejemplo)\s*[:：]`;
// Bold markup must pair around the label and its colon, never arbitrary prose.
const labeledExample=new RegExp(String.raw`(?:^|(?<=[\n。.!?;；\s]))(?:${exampleLabel}|\*\*${exampleLabel}\*\*|__${exampleLabel}__)\s*(?:${quotedSource.source})`,'giu');
const collocationLabel=String.raw`(?:搭配|常见搭配|Collocations?|Colocaciones?)\s*[:：]`;
const labeledCollocation=new RegExp(String.raw`(?:^|(?<=[\n。.!?;；\s]))((?:${collocationLabel}|\*\*${collocationLabel}\*\*|__${collocationLabel}__))\s*(?:${quotedSource.source}|([\p{Script=Latin}\p{M}]+(?:[ ’'\-]+[\p{Script=Latin}\p{M}]+)*))`,'giu');
function briefSourceExample(text:string,sourceLanguage:'en'|'es'){
 const words=text.toLocaleLowerCase().match(/[\p{Script=Latin}]+/gu)??[];
 if(text.length>300||!words.length||words.length>45||/\p{Script=Han}/u.test(text))return false;
 const spanish=words.some(word=>spanishWords.has(word)),english=words.some(word=>englishWords.has(word));
 return sourceLanguage==='en'?!(spanish&&!english):!(english&&!spanish);
}
function explanatoryText(answer:string,input:LookupLanguageInput){
 const source=[input.text,input.previousText??'',input.nextText??''];
 // A short, clearly labeled source collocation must contain the exact target word.
 // Keep its label and every Chinese explanation; exempt only the foreign phrase.
 let text=answer.replace(labeledCollocation,(whole,...groups:string[])=>{
  const phrase=groups.slice(1,7).find(value=>typeof value==='string')??'';
  if(!input.targetWord||(phrase.match(/[\p{Script=Latin}]+/gu)??[]).length>6||!briefSourceExample(phrase,input.sourceLanguage??'en'))return whole;
  const word=input.targetWord.normalize('NFC').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return new RegExp(`(?<![\\p{L}\\p{M}])${word}(?![\\p{L}\\p{M}])`,'iu').test(phrase.normalize('NFC'))?groups[0]:whole;
 });
 // Only explicitly labeled, brief examples in the source language are exempt.
 // Remove the label too: an example alone is not an explanatory answer.
 text=text.replace(labeledExample,(whole,...groups:string[])=>{
  const quote=groups.slice(0,5).find(value=>typeof value==='string')??'';
  return briefSourceExample(quote,input.sourceLanguage??'en')?'':whole;
 });
 // Exact source evidence may use straight/curly single or double quotes. Arbitrary
 // quoted foreign prose is still checked, never blanket-exempted as a quotation.
 text=text.replace(quotedSource,(whole,...groups:string[])=>{
  const quote=groups.slice(0,5).find(value=>typeof value==='string')??'';
  return source.some(value=>value.includes(quote))?'':whole;
 });
 if(input.targetWord){const word=input.targetWord.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');text=text.replace(new RegExp(`(?<![\\p{L}\\p{M}])${word}(?![\\p{L}\\p{M}])`,'giu'),'');}
 return text;
}
/** Conservative script/function-word guard, not a claim of full language detection. */
export function readingExplanationLanguageMatches(answer:string,input:LookupLanguageInput):boolean{
 const expected=readingExplanationLanguage(input);if(!expected)return true;
 const text=explanatoryText(answer,input);if(!/[\p{L}\p{M}]/u.test(text))return false;
 const han=(text.match(/\p{Script=Han}/gu)??[]).length;
 const words=text.toLocaleLowerCase().match(/[\p{Script=Latin}]+/gu)??[];
 if(expected==='zh'){
  // A Chinese paragraph elsewhere must not legitimize an independent parallel
  // English/Spanish explanation. Source evidence and labeled examples were
  // already removed above; brief collocations inside Chinese prose stay valid.
  const foreignSentence=text.split(/[.!?。！？\n]/u).some(sentence=>{
   const body=sentence.replace(/^[^\p{Script=Latin}]*[:：]\s*[*_]*\s*/u,'');
   return !/\p{Script=Han}/u.test(body)&&(body.match(/[\p{Script=Latin}]+/gu)??[]).length>=4;
  });
  return !foreignSentence&&han>=2&&han>=words.length;
 }
 if(han>0)return false;
 // Reject an unmistakably Spanish/English paragraph; short cognates and source
 // words stay valid rather than guessing a part of speech or dictionary meaning.
 const spanishCount=new Set(words.filter(word=>spanishWords.has(word))).size,englishCount=new Set(words.filter(word=>englishWords.has(word))).size;
 return expected==='en'?spanishCount<4||englishCount>=2:englishCount<4||spanishCount>=2;
}
