"""Import checksum-locked Kaikki Chinese Wiktionary into local English/Spanish shards.
Usage: python3 scripts/dictionaries/import-chinese.py /path/to/zh-extract.jsonl.gz /path/to/ecdict.csv
No network requests; definitions remain original Chinese (no machine translation).
"""
import csv,gzip,hashlib,json,re,sys,unicodedata
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
LOCK=json.loads((Path(__file__).parent/'chinese-sources.json').read_text())

def extract_record(data):
    if data.get('lang_code') not in ('en','es'):return None
    original=data.get('word','');word=unicodedata.normalize('NFC',original).lower().replace('’',"'")
    if not 0<len(word)<=64 or not all(c in "'-" or unicodedata.category(c).startswith('M') or c.isalpha() and 'LATIN' in unicodedata.name(c,'') for c in word):return None
    glosses=[]
    for sense in data.get('senses',[]):
        for gloss in sense.get('glosses',[]):
            if not isinstance(gloss,str):continue
            # Malformed source entries may embed another language's wiki section.
            gloss=re.split(r'={2,}[^=\r\n]+={2,}',gloss,maxsplit=1)[0].strip()
            if re.search('[\u3400-\u9fff]',gloss) and gloss not in glosses:glosses.append(gloss)
    if not glosses:return None
    ipa=next((s['ipa'] for s in data.get('sounds',[]) if isinstance(s.get('ipa'),str)), '')
    return data['lang_code'],word,[original,ipa,[data.get('pos','')],glosses]

def main(source,english_source):
    h=hashlib.sha256()
    with Path(source).open('rb') as f:
        for chunk in iter(lambda:f.read(1048576),b''):h.update(chunk)
    if h.hexdigest()!=LOCK['source']['sha256']:raise RuntimeError('Source checksum mismatch')
    entries={lang:{} for lang in ('en','es')}
    en_bytes=Path(english_source).read_bytes()
    if hashlib.sha256(en_bytes).hexdigest()!=LOCK['englishSource']['sha256']:raise RuntimeError('ECDICT checksum mismatch')
    with Path(english_source).open(encoding='utf-8-sig',newline='') as f:
        for row in csv.DictReader(f):
            original=row.get('word','');word=unicodedata.normalize('NFC',original).lower().replace('’',"'")
            if not 0<len(word)<=64 or not all(c in "'-" or unicodedata.category(c).startswith('M') or c.isalpha() and 'LATIN' in unicodedata.name(c,'') for c in word):continue
            definitions=[g.strip() for g in row.get('translation','').replace('\\n','\n').splitlines() if re.search('[\u3400-\u9fff]',g)]
            if definitions:entries['en'][word]=[original,row.get('phonetic',''),row.get('pos','').split('/') if row.get('pos') else [],list(dict.fromkeys(definitions))]
    with gzip.open(source,'rt',encoding='utf8') as f:
        for line in f:
            result=extract_record(json.loads(line))
            if not result:continue
            lang,word,record=result
            if lang=='en':continue
            old=entries[lang].get(word)
            if old:
                old[1]=old[1] or record[1]
                old[2]=list(dict.fromkeys(old[2]+record[2]));old[3]=list(dict.fromkeys(old[3]+record[3]))
            else:entries[lang][word]=record
    output=ROOT/'public/dictionaries'/LOCK['version'];output.mkdir(parents=True,exist_ok=True)
    manifest={**LOCK,'attribution':'English: ECDICT / Linwei (MIT). Spanish: Chinese Wiktionary contributors (CC BY-SA 4.0), Kaikki.org / Wiktextract. DeepReader filtering and sharding','languages':{}}
    for lang,words in entries.items():
        if not words:raise RuntimeError('No usable Chinese definitions for '+lang)
        buckets={f'{i:02x}':{} for i in range(256)}
        for word,record in words.items():buckets[hashlib.sha256(word.encode()).hexdigest()[:2]][word]=record
        dest=output/lang;dest.mkdir(exist_ok=True)
        stats={'words':len(words),'withIPA':sum(bool(v[1]) for v in words.values()),'shards':{}}
        for key,bucket in buckets.items():
            raw=(json.dumps(bucket,ensure_ascii=False,separators=(',',':'),sort_keys=True)+'\n').encode()
            (dest/(key+'.json')).write_bytes(raw)
            stats['shards'][key]={'sha256':hashlib.sha256(raw).hexdigest(),'words':len(bucket),'bytes':len(raw)}
        manifest['languages'][lang]=stats
        print(lang,stats['words'],'Chinese headwords;',stats['withIPA'],'with IPA',flush=True)
    (output/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')

if __name__=='__main__':main(sys.argv[1],sys.argv[2])
