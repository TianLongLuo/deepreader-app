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
