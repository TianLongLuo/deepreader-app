import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import path from 'node:path';
import {z} from 'zod';
import {sharedRequest} from './cancellation';
import sources from '../../../scripts/dictionaries/sources.json';
import chineseSources from '../../../scripts/dictionaries/chinese-sources.json';

// Both languages support NFC accents, hyphens and normalized apostrophes.
export const dictionaryWordSchema=z.string().trim().transform(word=>word.normalize('NFC').toLowerCase().replaceAll('’',"'")).pipe(z.string().min(1).max(64).regex(/^[\p{Script=Latin}\p{M}]+(?:['-][\p{Script=Latin}\p{M}]+)*$/u));
export const spanishDictionaryWordSchema=dictionaryWordSchema;
export type DictionaryEntry={word:string;phonetic:string;meanings:{partOfSpeech:string;definitions:{definition:string;example?:string}[]}[];audioUrl?:string;sourceUrl?:string;provider?:string;source?:string;sourceLanguage?:'en'|'es';definitionLanguage?:string;licenseUrl?:string;attribution?:string;datasetVersion?:string};
export class DictionaryError extends Error{constructor(message:string,public status:number){super(message);}}
const recordSchema=z.tuple([z.string(),z.string(),z.array(z.string()),z.array(z.string()).min(1)]);
const pos:Record<string,string>={adj:'adjective',adv:'adverb',conj:'conjunction',det:'determiner',intj:'interjection',name:'proper noun',num:'numeral',prep:'preposition',pron:'pronoun'};
const cache=new Map<string,Record<string,unknown>>();
export function dictionaryShard(word:string){return createHash('sha256').update(word).digest('hex').slice(0,2);}
export async function lookupDictionary(rawWord:string,signal?:AbortSignal,language:'en'|'es'='en',definitionLanguage:'en'|'zh'='en'):Promise<DictionaryEntry>{
 const word=dictionaryWordSchema.parse(rawWord);signal?.throwIfAborted();
 if(language!=='en'&&language!=='es')throw new DictionaryError('不支持的词库语言',400);
 if(definitionLanguage!=='en'&&definitionLanguage!=='zh')throw new DictionaryError('不支持的释义语言',400);
 const chinese=definitionLanguage==='zh';const ecdict=chinese&&language==='en';const source=chinese?chineseSources:sources;
 const bucket=`${language}/${dictionaryShard(word)}`;const key=`${definitionLanguage}/${bucket}`;
 let shard=cache.get(key);
 if(!shard){
  shard=await sharedRequest(`local-dictionary:${source.version}:${key}`,signal,async upstream=>{
   try{
    const file=path.join(process.cwd(),'public','dictionaries',source.version,`${bucket}.${chinese?'json':'bin'}`);
    const packed=await readFile(file,{signal:upstream});
    if(packed.length>8_000_000)throw new Error('Oversized dictionary shard');
    const text=(chinese?packed:gunzipSync(packed,{maxOutputLength:8_000_000})).toString('utf8');upstream.throwIfAborted();
    const value=JSON.parse(text) as Record<string,unknown>;
    if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid dictionary shard');
    if(cache.size>=8)cache.delete(cache.keys().next().value!);
    cache.set(key,value);return value;
   }catch{upstream.throwIfAborted();throw new DictionaryError('本站词库读取失败，请稍后重试。',503);}
  });
 }
 signal?.throwIfAborted();
 const parsed=recordSchema.safeParse(Object.hasOwn(shard,word)?shard[word]:undefined);
 if(!parsed.success)throw new DictionaryError(chinese?'本站中文词库暂未收录该词，可切换英文释义或查看语境解析。':'本站词库暂未收录该词，可尝试原形或查看语境释义。',404);
 const [original,phonetic,parts,definitions]=parsed.data;
 return {word,phonetic,meanings:[{partOfSpeech:parts.map(p=>pos[p]||p).join(' / '),definitions:definitions.map(definition=>({definition}))}],provider:ecdict?'local-ecdict':'local-wiktionary',source:ecdict?'本站 ECDICT 英中词库':chinese?'本站中文 Wiktionary 西中词库':'本站 Wiktionary 词库',sourceLanguage:language,definitionLanguage,licenseUrl:ecdict?chineseSources.englishSource.license:source.license,sourceUrl:ecdict?chineseSources.englishSource.upstream:`https://${chinese?'zh':'en'}.wiktionary.org/wiki/${encodeURIComponent(original)}#${language==='es'?(chinese?'西班牙語':'Spanish'):'English'}`,attribution:ecdict?'ECDICT · Linwei · MIT · 本站筛选与分片':chinese?'中文维基词典贡献者 · CC BY-SA 4.0 · Kaikki.org / Wiktextract · 本站筛选与分片':'Wiktionary contributors · CC BY-SA 3.0 · Compact Dictionaries / Teal Dulcet · 本站离线数据整理',datasetVersion:source.version};
}
