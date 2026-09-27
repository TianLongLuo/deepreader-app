"""Build distributable, self-hosted shards from checksum-pinned downloaded JSONL.
Usage: python3 scripts/dictionaries/import.py .sites-runtime/dictionaries
Download the two URLs in sources.json first. No network is used during import/build.
"""
import sys,json,hashlib,gzip,tempfile,unicodedata
from pathlib import Path
from collections import OrderedDict
root=Path(__file__).resolve().parents[2]
lock=json.loads((Path(__file__).parent/'sources.json').read_text())
output=root/'public/dictionaries'/lock['version']
output.mkdir(parents=True,exist_ok=True)
manifest={**lock,'definitionLanguage':'en','attribution':'Wiktionary contributors; compact preprocessing by Teal Dulcet; DeepReader adaptation','languages':{}}
def valid(word):
    return 0<len(word)<=64 and all((unicodedata.category(c)[0]=='M' or (c.isalpha() and 'LATIN' in unicodedata.name(c,''))) or c in "'-" for c in word)
for lang,source in lock['sources'].items():
    path=Path(sys.argv[1])/f'{lang}.jsonl'
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1048576),b''):h.update(chunk)
    digest=h.hexdigest()
    if digest!=source['sha256']: raise RuntimeError(f'{lang}: checksum mismatch: {digest}; verify upstream before updating sources.json')
    counts={'sourceEntries':0,'words':0,'withIPA':0,'shards':{},'compressedBytes':0}
    dest=output/lang;dest.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='dictionary-') as temp:
        handles=OrderedDict()
        for line in path.open(encoding='utf-8'):
            data=json.loads(line);counts['sourceEntries']+=1
            original=data[''];word=unicodedata.normalize('NFC',original).lower().replace('’',"'")
            if not valid(word) or not data.get('d'): continue
            shard=hashlib.sha256(word.encode()).hexdigest()[:2]
            if shard not in handles:
                if len(handles)>=48: handles.popitem(last=False)[1].close()
                handles[shard]=open(Path(temp)/shard,'a',encoding='utf-8')
            handles.move_to_end(shard)
            # Audio URLs are intentionally excluded: audio has per-file licenses.
            record=[original,data.get('i',''),data['p'],data['d']]
            handles[shard].write(json.dumps([word,record],ensure_ascii=False)+'\n')
        for f in handles.values():f.close()
        for i in range(256):
            shard=f'{i:02x}';records={};bucket=Path(temp)/shard
            if bucket.exists():
                for line in bucket.open(encoding='utf-8'):
                    word,item=json.loads(line)
                    if word in records:
                        old=records[word];old[1]=old[1] or item[1]
                        old[2]=list(dict.fromkeys(old[2]+item[2]));old[3]=list(dict.fromkeys(old[3]+item[3]))
                    else:records[word]=item
            raw=json.dumps(records,ensure_ascii=False,separators=(',',':'),sort_keys=True).encode()
            packed=gzip.compress(raw,compresslevel=9,mtime=0)
            (dest/f'{shard}.bin').write_bytes(packed)
            counts['words']+=len(records);counts['withIPA']+=sum(bool(v[1]) for v in records.values());counts['compressedBytes']+=len(packed)
            counts['shards'][shard]={'sha256':hashlib.sha256(packed).hexdigest(),'words':len(records),'bytes':len(packed),'uncompressedBytes':len(raw)}
    manifest['languages'][lang]=counts
    print(lang,{k:v for k,v in counts.items() if k!='shards'},flush=True)
(output/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
