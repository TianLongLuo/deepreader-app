"""Bounded offline wordfreq query; no network and no input text in diagnostics."""
import hashlib
import importlib.metadata
import json
import math
from pathlib import Path
import sys
import unicodedata

def main():
    manifest = json.loads(Path(__file__).with_name('manifest.json').read_text('utf8'))
    distribution = importlib.metadata.distribution('wordfreq')
    if distribution.version != manifest['packageVersion']:
        raise ValueError('version')
    for file, expected in manifest['dataHashes'].items():
        if hashlib.sha256(Path(distribution.locate_file(file)).read_bytes()).hexdigest() != expected:
            raise ValueError('data integrity')
    raw = sys.stdin.buffer.read(65537)
    if len(raw) > 65536:
        raise ValueError('size')
    items = json.loads(raw)
    if not isinstance(items, list) or len(items) > 100:
        raise ValueError('batch')
    from wordfreq import zipf_frequency
    result = []
    for item in items:
        if not isinstance(item, dict) or set(item) != {'lemma', 'language'}:
            raise ValueError('fields')
        lemma, language = item['lemma'], item['language']
        if not isinstance(lemma, str) or not 1 <= len(lemma) <= 200 or language not in ('en', 'es'):
            raise ValueError('word')
        lemma = unicodedata.normalize('NFC', lemma)
        value = zipf_frequency(lemma, language)
        result.append({'lemma': lemma, 'language': language, 'zipf': value if math.isfinite(value) and value > 0 else None,
                       'version': manifest['version'], 'source': manifest['source']})
    json.dump(result, sys.stdout, ensure_ascii=False, allow_nan=False)

if __name__ == '__main__':
    try:
        main()
    except Exception:
        sys.stderr.write('Offline frequency query failed\n')
        sys.exit(1)
