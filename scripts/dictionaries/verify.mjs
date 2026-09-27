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
