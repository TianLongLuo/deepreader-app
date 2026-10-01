import {execFile} from 'node:child_process';
import path from 'node:path';
import {z} from 'zod';
import manifest from '../../../scripts/frequency/manifest.json';
import type {SourceLanguage} from './types';
export const frequencyVersion=manifest.version;
export const frequencyNotice='wordfreq 3.1.1 · 约截至2021年快照；通用词频，不是行业实时词频。分档是产品设置，不代表权威语言难度。';
export function frequencyBand(value:number|null){return value===null||!Number.isFinite(value)||value<=0?'unknown':value>=4?'common':value>=3?'general':'less-common';}
export {frequencyLabels} from '@/lib/frequency-labels';
const inputSchema=z.array(z.object({lemma:z.string().trim().min(1).max(200).transform(v=>v.normalize('NFC')),language:z.enum(['en','es'])}).strict()).max(100);
const outputSchema=z.array(z.object({lemma:z.string(),language:z.enum(['en','es']),zipf:z.number().positive().max(8).nullable(),version:z.literal('wordfreq-3.1.1'),source:z.literal('https://github.com/rspeer/wordfreq')}).strict()).max(100);
export type FrequencyRecord=z.infer<typeof outputSchema>[number];
const cache=new Map<string,FrequencyRecord>();
export async function lookupFrequency(words:Array<{lemma:string;language:SourceLanguage}>,signal:AbortSignal):Promise<FrequencyRecord[]>{
 signal.throwIfAborted();const input=inputSchema.parse(words);if(!input.length)return [];
 const key=(word:{lemma:string;language:string})=>JSON.stringify([word.lemma,word.language,frequencyVersion]),found=new Map<string,FrequencyRecord>();for(const word of input){const row=cache.get(key(word));if(row)found.set(key(word),row);}const missing=input.filter(word=>!found.has(key(word)));
 if(missing.length){
  const raw=await new Promise<string>((resolve,reject)=>{
   // Separate installed runtime; never bundle a host-specific virtualenv into Next assets.
   const child=execFile('/bin/sh',[path.resolve(process.cwd(),'scripts/frequency/run.sh')],{signal,timeout:10000,maxBuffer:2*1024*1024,encoding:'utf8'},(error,stdout)=>{if(error)reject(signal.aborted?signal.reason:new Error('离线词频数据暂不可用'));else resolve(stdout);});
   child.stdin?.on('error',()=>{});child.stdin?.end(JSON.stringify(missing));
  });signal.throwIfAborted();
  const result=outputSchema.parse(JSON.parse(raw));if(result.length!==missing.length||result.some((row,index)=>row.lemma!==missing[index].lemma||row.language!==missing[index].language)||manifest.packageVersion!=='3.1.1')throw new Error('词频版本或查询对应关系不正确');
  for(const row of result){if(cache.size>=4096)cache.delete(cache.keys().next().value!);cache.set(key(row),row);found.set(key(row),row);}
 }
 return input.map(word=>found.get(key(word))!);
}
