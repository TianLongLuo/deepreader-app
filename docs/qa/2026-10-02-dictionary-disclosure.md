# Dictionary disclosure preference — 2026-10-02

- Dictionary definitions start expanded when no preference exists.
- The most recent native summary toggle persists in `localStorage`, namespaced by current user ID and independent of book/word.
- Other disclosures keep their original defaults. Account changes remount the preference boundary; programmatic restoration does not overwrite stored preferences.
- Storage-denied browsers still support session toggling, but persistence requires available browser storage. Clearing site data resets the preference; this is not cross-device sync.
- RED: all four new component regressions failed against the original collapsed/unremembered UI. GREEN: 94 files / 533 tests, TypeScript, production build, diff check.
- Real isolated Chromium tested default expansion, mouse collapse, next book, reload, account isolation and keyboard reopening using the actual component. No AI calls or production credentials were used. The only browser console error was the fixture's absent favicon (404).
- No dependencies, schema, server configuration or AI request logic changed. Deployment requires rebuilding DeepReader and refreshing the reader page once.
