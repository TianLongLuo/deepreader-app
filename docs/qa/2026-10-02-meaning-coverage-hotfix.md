# Meaning-group coverage hotfix — 2026-10-02

## Reproduced production cause

With the user's explicit approval, sent only the two screenshot excerpts to the existing configured provider, DeepSeek-v4-flash, through old and patched generators. No full book or credentials were included in model input.

- Old long paragraph: failed after 7 prefix events. Optional `can smell` does not occur contiguously in `and while you can usually smell the ocean`.
- Old dialogue: failed after 2 prefix events. Optional `are doing` does not occur contiguously in `are you doing?`.
- Strict validation rejected the entire unit, and the client removed its prefix highlighting. The queue then left it failed until manual retry.
- Patched long paragraph: complete, 13 groups, 1 call, 1,353 ms.
- Patched dialogue: complete, 3 groups, 1 call, 961 ms.

This was an output-alignment failure, not a paragraph-length or day/night-color issue.

## Fix and boundaries

1. Validate exact source groups first. Invalid optional emphasis is omitted individually; valid emphasis and all valid groups survive.
2. Keep the strict client/cache validator unchanged in behavior: omitted, invented, duplicated or split source words still fail.
3. Tell the model to use exact contiguous verb excerpts, including separate excerpts for interrupted predicates.
4. At most one repair for malformed JSON/source alignment, charged to the existing quota. No automatic repair for provider failures, authorization errors or cancellation. No fake full-paragraph fallback.
5. Version the generated-result cache to avoid reusing prior prompt results.

## Verification

- New dialogue and source-repair regressions failed before the fix, then passed.
- Full suite: 93 files, 529 tests passed.
- TypeScript and production build passed.
- Exact screenshot paragraph ranges reconstruct the unchanged original text; Spanish accented-source coverage also tested.
- Real-model old/fixed comparison completed before deployment. This does not guarantee all future model calls succeed; persistent failures remain explicit and manually retryable.

Deployment is restricted to DeepReader code/build and its web service. No schema, dependencies, SSH/firewall, provider configuration or unrelated services need changing.

## Production deployment and HTTPS acceptance

- Deployed code commit: `bb80a4147b716a84c3623f834aa0bcb4e84e46c5`.
- Rollback backup: `/opt/deepreader-app-backups/20261002-115008-meaning-bb80a41` (previous code/build and consistent database snapshot).
- Release marker: `__MEANING_HOTFIX_SUCCESS__`. Database quick/foreign-key checks passed.
- Original environment, Nginx, both service units, provider settings and book files verified unchanged by SHA256. Existing worker PID unchanged. No migration, dependency installation or unrelated service restart.
- Using the user's existing browser login, the deployed HTTPS endpoint returned complete exact coverage for both approved excerpts: long paragraph 12 groups, first prefix 1,967 ms/final 2,466 ms; dialogue 3 groups, first prefix 942 ms/final 984 ms. Different valid model groupings can have different counts.
- Public login endpoint returned HTTP 200; unauthenticated meaning endpoint returned HTTP 401.
- Reload the reader once to clear old failed-queue state; the old page's failed entries do not spontaneously rerun merely because the server changed.
