# Reader streaming execution evidence

## Task 1 — daylight defaults (local, not deployed)
- Branch reader-learning; BASE 1de7ae7. Baseline: 51 files / 314 tests.
- RED: reader-theme tests: 4 failed, 1 passed, proving old system/dark defaults, migration and synchronization mismatch.
- GREEN: theme/preferences/shell 13 passed; complete suite 52 files / 321 tests; TypeScript exit 0.
- Fresh isolated Chrome, system color scheme dark: /login HTTP200, html dark=false/colorScheme=light. Saved dark preference survives reload.
- Bootstrap executed under invalid values and denied storage; existing custom sizes preserved, sepia reader preference not overwritten by UI switch.
- Screenshots: ignored workspace .superpowers/sdd/2026-10-01-reader-streaming/task-1-light.png and task-1-dark.png; default image visually checked.
- QA uses own temporary browser profile and local webpack/polling server. No production, GitHub, other services or user Chrome tabs changed.
- Remaining: coverage, dark meaning colors, streaming services/clients, vocabulary and practice plans.

## Task 2 — bounded text units (not yet wired into the reader)
- Unit API initially absent; tests written first. Additional behavioral mutation returning the whole paragraph produced 4 failing cases; restored implementation produces 7/7 passing unit tests.
- Full suite: 53 files / 328 tests; TypeScript exit0.
- Coverage checks include 6K+ Spanish text, exact source offsets/tail, sentence boundaries, whitespace fallback, contractions/hyphens/emoji/combining accents, oversized token explicit error and unsafe sizes.
- Shifted spans use a separate render-only type, not a falsely validated unit result. Reader integration belongs to Task3 and streaming integration to Task6–7.

## Task 3 — non-mutating text sources

- Real DOM (jsdom) tests cover mixed blockquote direct text before/after nested paragraphs, unmarked div prose, whitespace/BR, inline text, UTF16, hidden/control/footnote exclusion, PDF source-only scope, long paragraph tail and node replacement.
- Focused: 3 files / 15 tests passed; full suite: 54 files / 334 tests passed. TypeScript check passed.
- Independent Chrome fixture using the compiled source collector: four passages retained exactly once; inline `direct` Range has one rendered rectangle; innerHTML unchanged.
- Hook now splits canonical sources into bounded units and tests actual Range rectangles against iframe/PDF clips. Successful text cache does not store DOM nodes. Mutation invalidates source mappings. Full reader/model coverage is scheduled at Task 8.
- Test-only exact dependencies: jsdom 26.1.0 / @types/jsdom 21.1.7.

## Task 4 — queue coverage and bounded throttling recovery

- RED on prior implementation: 11 queue/route/service assertions failed (35 visible units, waiting state, retry timing/budget, cancellation and Retry-After).
- Removed both 32-unit truncations. Queue retains all visible units, at most two active requests, reuses successes and reports pending/deferred work during pauses.
- 429 automatically retries at most three times per visible set: bounded Retry-After or 5/15/45-second fallback. 401/403/503 need explicit retry. Disable/empty viewport cancels timers; aborted sibling results never cache.
- Service retains 24/minute and two-flight quotas; Retry-After uses remaining server window (53 seconds after a 7.5-second elapsed fixture).
- Focused 4 files / 33 tests passed; full suite 54 files / 348 tests passed; TypeScript passed. No production changes yet.

## Task 5 — shared true-stream transport

- RED: 13 new transport/lexical decoding cases failed on stubs; later error-size/adapter and malformed-wire regressions reproduced separately.
- Shared typed NDJSON consumer/writer preserve split UTF8, final line, request identity, real delta ordering and size bounds (1 MiB event / 128 KiB generated payload). EOF is not a successful draft.
- Server has private/no-store/no-transform and proxy no-buffering headers, 15-second heartbeats, request/reader cancellation and a public error-code/message whitelist. Thrown and generator-provided secrets do not reach clients.
- Lexical top-level string decoder ignores nested keys/key-like values; complete JSON escapes and surrogate pairs only. No fake typewriter.
- Explicit explanation adapter keeps the existing section callbacks; shared consumer now handles that panel's transport and signal.
- Focused 3 files / 25 tests; full suite 56 files / 368 tests; TypeScript passed. Server generators and all remaining UI clients are the next two tasks.

## Task 6 — streaming model services

- RED: 16 new service cases failed before implementation. Additional regressions reproduced oversized-final caching and duplicate summary scope.
- Reading actions call provider.stream only; top-level answer deltas arrive before a gated provider finishes. Final quotes are checked against supplied source. Quiz emits no answer deltas. Cache hits are start(cached)+complete, never simulated typing.
- Meaning groups stream only completed objects, validating a contiguous prefix and finite verb offsets against the full original source (a truncated word like `Th` is rejected). Final coverage remains mandatory. API inputs are split into <=1200-character provider units; long tail preserved.
- Shared in-flight streams keep current replayable prefixes; canceling one subscriber leaves another alive, last subscriber aborts upstream. Successful cache and 24/minute/two-flight meaning quotas retained.
- Routes perform authentication, workspace/document ownership and AI config checks before returning NDJSON. Explicit Accept selects streaming; old JSON clients retain compatibility, including legacy config-error status 502 (new stream clients use 503).
- Oversize final values are rejected before cache insertion. Stream errors have public codes/messages only.
- Full suite: 58 files / 392 tests passed; TypeScript passed. Reader clients switch in Task 7. Production remains unchanged.

## Task 7 — all reader clients and draft isolation

- RED: lookup/session tests failed on prior full-JSON UI and session stubs. A later regression reproduced retained word-A further-understanding text when switching to B; reset now clears it.
- React lookup displays word/context and further-understanding drafts while busy. Dictionary JSON runs independently. Save-before-complete retains word/context/location but no draft meaning. Switching word/language and hiding/unmounting tools aborts earlier work and suppresses late updates.
- Reading tools quick/ask/etc use the same NDJSON helper; meaning hook consumes validated prefix units, repaints current source identities, and clears the unit prefix on error/cancel. Only complete enters success cache.
- Paragraph streaming no longer falls back to complete or a hidden nonstream repair after displaying draft content; invalid/incomplete final structure fails explicitly and is not saved as success. Legacy nonstream APIs retain compatibility. Streaming-state labels become UNVALIDATED when generation stops.
- Full suite 61 files / 401 tests passed; TypeScript passed. Real Chrome full-reader coverage follows in Task 8.

### Reader action transport matrix

| Action | Request transport | Completion gate |
| --- | --- | --- |
| Click-word context | `/api/reading-assistant`, Accept NDJSON | Grounded final answer; request generation guard |
| Further understanding: example, collocations, etymology, synonyms | Same, ask mode | Grounded final answer; independent cancel/reset |
| quick / explain / translate / ask | Same | Grounded quotes; final only can become answer/history |
| summary | Same | Grounded answer; excerpt notice once |
| quiz | Same, no answer deltas | Grounded questions; answers hidden until UI reveal |
| Detailed stored paragraph | `/api/paragraphs/:id/explain`, stream=true | Structure validation; no hidden nonstream retry |
| Detailed selected text | `/api/explain-text`, stream=true | Ownership + same paragraph validation |
| Sense-group reading | `/api/meaning-groups`, Accept NDJSON | Contiguous source prefix/verbs; mandatory final coverage |
| Dictionary / notes / bookmarks / search | Ordinary JSON; not AI generation | Existing ownership/data checks |

`/api/reading-assistant` appears in client source only in the shared stream request helper; no reader JSON caller remains. Remaining provider.complete calls are explicit legacy JSON generators and paragraph nonstream repair (allowRepair default only for explicit nonstream path), plus administrative diagnostics; none is called by the new reader streaming paths.

## Task 8 — palette and real-browser source coverage

- Opaque day/sepia/night palettes with explicit body/verb foreground, including persistent low-saturation option; independent sRGB contrast tests for all 18 combinations pass at >=4.5:1.
- Real ReaderLayout/ReactReader in independent Chrome, valid generated EPUB: 48 visible source units requested (not truncated at 32), maximum two concurrent meaning requests, no unit above 1,200 characters. Body innerHTML and all paragraph rectangles unchanged by highlighting; ranges rebuilt on identical DOM replacement.
- Browser-discovered hidden→visible same-node bug reproduced at zero requests; source-only attribute observation fixed it. HTML and XHTML source tests pass, including lowercase EPUB XML tags and BR boundaries; controls, navigation and footnote links excluded.
- QA fixture script: `node scripts/qa/reader-streaming.mjs --port 3018`. Mock responses are only transport/component evidence, not evidence of model segmentation accuracy.
- Fresh full suite: 62 files / 408 tests; TypeScript passes; production build succeeds, including all four local dictionary datasets. Existing broad dictionary file-pattern build warning remains non-fatal.
- Real English/Spanish provider quality and deployed-proxy stream timing remain **pending release gates**, not substituted by the fixture. One fresh whole-branch review follows all three plans.
- Long EPUB paragraph: paginated to final tail successfully; largest submitted unit 1,175 characters. Text PDF: scroll moved active highlights from initial visible lines to paragraphs 36–42, excluding page controls/translations.
- Real word interaction: draft visible before completion; final visible after validation; neighboring word remained clickable; no paragraph geometry change when panel opened; closing a new lookup canceled its pending stream. Day/night/PDF/narrow screenshots inspected in isolated fixture.
