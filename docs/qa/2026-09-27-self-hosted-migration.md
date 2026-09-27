# Self-hosted migration QA — 2026-09-27

Base: `fb2c77dd01e152ad67df3af346bb2e6e52213d5f`. Source: Sites v7 (`ed422a6`). Target runtime: Next.js / Node.js 22 / Prisma / SQLite. No Sites or customer server deployment performed.

## Verification
- `npm test`: 40 files, 268 tests passed.
- `npx tsc --noEmit`: passed.
- `DATABASE_URL=file:<isolated-test-db> npm run build`: passed, including all 512 local dictionary shard integrity checks.
- Built original-base SQLite schema in a temporary directory, inserted a legacy user, applied new schema without reset/data-loss flags, verified user and password hash unchanged.
- Local production Next server: signup with automatic session, admin bootstrap, non-admin denial, document/workspace isolation, English `occasion` and Spanish `niño` offline dictionary with IPA, EPUB/PDF multipart uploads, PDF text parsing, persisted note creation/read: passed.
- Real Chromium EPUB UI at 1280×900 and 390×844: word selection opens compact panel; reading-body bounding box unchanged before/after; mobile panel fits viewport. Size 340×460 persisted across close/reopen and reload. AI responses intercepted with a fixture; no paid model request used.
- Git/runtime scan: no Cloudflare bindings or Prisma WASM in `src`; runtime `.env`, SQLite and `storage/` excluded from tracked delivery. Source-provided encrypted runtime config removed from tracking, not copied into new deployments.

## Independent review and fix pass
A fresh-context reviewer identified four important findings. Regression tests were observed failing, then passing for: legacy password login policy, mixed-case legacy account lookup/registration, legacy floating-panel size migration, and invalid PDF/EPUB containers. Full suite passed after the fixes.

## Decisions / upgrade requirements
- ADMIN role is required; the legacy email-only admin exception is removed. Existing email-only admins need an explicit operator-assigned ADMIN role (no automatic promotion).
- Legacy email case collisions remain separate accounts and require original exact spelling. No user/workspace is renamed or merged.
- Historical tracked `storage/system/app-config.json` is untracked going forward. Old installations must back it up outside the checkout before pulling and restore afterward; preserve ENCRYPTION_KEY. Historical provider credentials should be rotated at the provider. Git history was not rewritten.
- Reviewer excluded binary vendor internals and actual production data from review, consistent with scope; asset checksums and local integration were verified. This is not a live data migration or server deployment.

## Deferred minor
A malformed individual record within an otherwise valid dictionary shard returns 404 rather than 503. Missing/corrupted shard IO returns 503, and build-time hashes validate bundled files. No external dictionary fallback exists.

## Limitations
Live external AI/TTS providers, S3 service connectivity, and an actual Ubuntu production host were not exercised. Local storage, server parsing, mocked AI, and browser interaction were exercised. Existing dependency-audit findings were not automatically upgraded in this migration.
