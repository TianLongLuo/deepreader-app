import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
const root=new URL('../../',import.meta.url);
const lock=JSON.parse(readFileSync(new URL('sources.json',import.meta.url),'utf8'));
const base=new URL(`public/dictionaries/${lock.version}/`,root);
const manifest=JSON.parse(readFileSync(new URL('manifest.json',base),'utf8'));
if(manifest.version!==lock.version)throw Error('Dictionary version mismatch');
for(const lang of ['en','es']){
 const stats=manifest.languages[lang];let words=0,ipa=0;
 if(!stats||Object.keys(stats.shards).length!==256||stats.words<500000)throw Error(`Incomplete ${lang} dictionary`);
 if(manifest.sources[lang].sha256!==lock.sources[lang].sha256)throw Error('Source checksum mismatch');
 for(const [id,info] of Object.entries(stats.shards)){
  const packed=readFileSync(new URL(`${lang}/${id}.bin`,base));
  if(createHash('sha256').update(packed).digest('hex')!==info.sha256)throw Error(`Corrupt ${lang}/${id}`);
  const raw=gunzipSync(packed);if(raw.length!==info.uncompressedBytes||raw.length>8000000)throw Error('Invalid shard size');
  const entries=JSON.parse(raw);words+=Object.keys(entries).length;ipa+=Object.values(entries).filter(e=>e[1]).length;
 }
 if(words!==stats.words||ipa!==stats.withIPA)throw Error(`Count mismatch: ${lang}`);
 console.log(`Self-hosted dictionary ${lang}: ${words} headwords; ${ipa} with IPA. Integrity verified.`);
}
for(const [lang,word] of [['en','occasion'],['es','niño'],['es','casa']]){
 const id=createHash('sha256').update(word).digest('hex').slice(0,2);
 const entries=JSON.parse(gunzipSync(readFileSync(new URL(`${lang}/${id}.bin`,base))));
 if(!entries[word]?.[1]||!entries[word]?.[3]?.length)throw Error(`Missing reference word: ${word}`);
}

const chinese=JSON.parse(readFileSync(new URL('chinese-sources.json',import.meta.url),'utf8'));
const chineseBase=new URL(`public/dictionaries/${chinese.version}/`,root);
const chineseManifest=JSON.parse(readFileSync(new URL('manifest.json',chineseBase),'utf8'));
if(chineseManifest.source.sha256!==chinese.source.sha256||chineseManifest.englishSource.sha256!==chinese.englishSource.sha256)throw Error('Chinese dictionary source mismatch');
for(const lang of ['en','es']){
 const stats=chineseManifest.languages[lang];let count=0;
 if(!stats||Object.keys(stats.shards).length!==256||stats.words<10000)throw Error('Incomplete Chinese dictionary');
 for(const [key,info] of Object.entries(stats.shards)){
  const bytes=readFileSync(new URL(`${lang}/${key}.json`,chineseBase));
  if(bytes.length!==info.bytes||createHash('sha256').update(bytes).digest('hex')!==info.sha256)throw Error(`Chinese shard integrity error: ${lang}/${key}`);
  const entries=JSON.parse(bytes.toString('utf8'));count+=Object.keys(entries).length;
  if(Object.keys(entries).length!==info.words||Object.values(entries).some(r=>!Array.isArray(r)||!r[3]?.length||r[3].some(d=>typeof d!=='string'||!/[\u3400-\u9fff]/.test(d))))throw Error('Invalid Chinese dictionary record');
 }
 if(count!==stats.words)throw Error('Chinese headword count mismatch');
 console.log(`${lang} → Chinese: ${count} local headwords verified`);
}
