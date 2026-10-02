# Offline frequency data / 离线词频来源

- Library/data package: **wordfreq 3.1.1**, by **Robyn Speer**. [Pinned release](https://pypi.org/project/wordfreq/3.1.1/) / [upstream documentation and credits](https://github.com/rspeer/wordfreq).
- Code: **Apache-2.0**; packaged data: **CC BY-SA 4.0**, with additional source attributions. Full unmodified release metadata, license description, sources and SUBTLEX citations are retained in `UPSTREAM-METADATA.txt` and the installed distribution. The data remains in the official library format, not an uncredited extracted CSV.
- SUBTLEX authors include **Marc Brysbaert, Boris New, Emmanuel Keuleers, Qing Cai, Walter J. B. van Heuven, Pawel Mandera**, and their coauthors; SUBTLEX is freely available data. Exact individual citations and additional Wikipedia, OPUS, Leeds, Google Books and other credits are preserved in the pinned upstream metadata.
- English/Spanish large-data SHA256, downloaded wheel hashes and source URLs: `manifest.json`. Every pinned transitive distribution hash is recorded in `requirements.lock`; no optional CJK/OCR packages.
- Frequency is a **general language-use snapshot through about 2021**, not real-time, not an industry-specific corpus, and not a definitive language proficiency level.
- Product bands: Zipf >=4 “较常见”; 3<=Zipf<4 “一般”; 0<Zipf<3 “较少见”. A zero/missing result is **暂无数据**, never inferred “生僻词”. Accents and multiword input are preserved through NFC; official tokenization handles lookup.
- Personal processed-material positions and manually chosen priority are separate fields. The position count is not a claim that every book has been scanned, and repeated rendering does not create new occurrences.

Install only in this application's `.runtime/frequency` using `setup.sh`; no system pip, apt, Redis or Python daemon. Runtime queries use stdin to a fixed local script with a 100-item batch, 10-second timeout and 2 MiB output bound. Runtime makes no network dictionary/frequency calls. The installed version and EN/ES data SHA256 are checked before returning values.

The app-only installer supports hosts without `ensurepip` using the official [pip 25.2 wheel](https://pypi.org/project/pip/25.2/) (MIT, Python 3.9+), verified against SHA256 `6d67a2b4e7f14d8b31b8b52648866fa717f45a1eb70e83002f4331d07e953717` before execution. Bootstrap is bounded to 8 MiB/60 seconds, uses `venv --without-pip`, and installs only into `.runtime/frequency` with no system package/global pip changes.
