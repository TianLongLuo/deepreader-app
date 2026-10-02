# Rulings I made / 执行决策记录

保留三个实施阶段的全部裁定，按阶段与记录顺序排列。每条含理由及适用代价；未另写代价的运行环境决定，其代价是重做本地构建或验收，不改变生产数据。

1. Ruling: Native app worktree tool returned Not a git repository — use ignored .worktrees/reader-learning fallback; no other checkout changes except ignore rule.

2. Ruling: node_modules initially symlinked to verified baseline dependencies; remove symlink and install separately before any dependency/schema changes so original checkout stays intact.

3. Ruling: QA dev inferred parent repository root and returned login404 with EMFILE watchers — moved the isolated worktree to sibling deepreader-learning-20261001 and replaced dependency symlink with its own npm ci; this changes only local test workspace.

4. Ruling: macOS sandbox filesystem watchers return EMFILE and route discovery404 even in sibling checkout — use WATCHPACK_POLLING=true and webpack solely for local dev QA; do not change production config.

5. Task 2: Ruling: offsetMeaningResult returns MappedMeaningSpans, not MeaningGroupResult — shifted spans violate unit-relative result bounds; validate unit first, then map for rendering.

6. Task 3: Ruling: use jsdom 26.1.0 as dev-only test tooling instead of fabricated DOM adapters — exercise real TreeWalker and Range with no runtime business dependency.

7. Task 5: Ruling: include a small client explanation event adapter now — server unification otherwise breaks existing chunk/final section UI until Task 7; preserve presentation and use the shared cancellation/validation consumer immediately.

8. Task 6: Ruling: unit values are validated cumulative prefixes in original-source offsets; cap each prefix and final result at 128 KiB, not the sum of repeated prefix bytes — summing repeated source/prefix text rejects ordinary long passages. Shared replay retains/coalesces only current prefix; no success cache before final coverage.

9. Task 6: Ruling: explicit Accept application/x-ndjson selects new transport; no Accept preserves legacy JSON requests until clients switch in Task 7. Quota preflight emits HTTP Retry-After when already limited; a concurrency race after headers is a sanitized RATE_LIMITED stream event.

10. Task 7: Ruling: keep a pure request/session helper beside the React hook — test late/aborted generations directly and reuse the same true-stream consumer in the existing multi-action tools rather than rewrite their non-AI operations.

11. Task 7: Ruling: streaming paragraph finalization does not run hidden nonstream repair/retry — stream failures and invalid final structure now remain explicit failures, while legacy explicit nonstream requests retain their original repair path. This prevents mixing a second generation into an already displayed draft and paid fallback calls.

12. Task 8: Ruling: use opaque restrained group backgrounds and explicit foreground — makes actual contrast independent of inherited EPUB colors; meaning/verb/hover priorities stay -10/-5/0.

13. Task 8: Ruling: one fresh whole-branch review after all three approved plans, not a stage reviewer — matches Native inline execution skill and avoids repetitive delegation; stage QA still runs now.

14. Task 8: Ruling: real English/Spanish model and production proxy acceptance remain mandatory final-release gates — isolated workspace has no production credentials and does not copy them locally; browser fixture only validates genuine components/transport and is explicitly not linguistic model acceptance.

15. Ruling: one final whole-branch reviewer after all three plans; no per-task delegation. Hermes mechanical fallback already established due local log permissions.

16. Task 2: Ruling: install the approved ts-fsrs@5.4.2 dependency in Task2, not Task3 — Task2 already requires official createEmptyCard to avoid invented migration state; Task3 still implements and verifies the scheduler adapter.

17. Task 2: Ruling: explicit user deletion cascades private review logs; merge/archive preserves them — prevents dangling private records after deletion while maintaining non-destructive sense operations.

18. Task 2: Ruling: use Node22 built-in sqlite for additive versioned SQL runner, no system DB tooling or external service; runtime already Node22, temporary fixtures initialize the preserved legacy schema first.

19. Task 3: Ruling: disable legacy answer-visible grading now; replace its UI controls in Task6 before any release — an interim branch is not published, and keeping the old bypass would violate the hidden-answer contract.

20. Task 5: Ruling: suggestion authorization is an injected server-only job verifier, closed by default — no public route exposes applySuggestion; persistent worker in the next plan binds verifier to a scoped, leased job. This lets migration/capture stay provider-independent.

21. Task 5: Ruling: user tags are bounded manual annotations; generated categories remain controlled by next plan's taxonomy — manual annotations are not silently overwritten or converted into unrestricted AI-created category trees.

22. Task 6: Ruling: preserve all three secondary reading record types without loading their data into the review component; recordsOnly query omits word notes from this secondary entry.

23. Task 6: Ruling: tsx uses CJS for this project; wrap migration/QA script awaits in async main rather than changing package module type globally. Startup RED observed, actual fixture GREEN.

24. Task 7: Ruling: independent review and publish are deferred to the single whole-branch gate after learning-practice Task6 — continuous three-plan delivery, not an intermediate release; production-copy and online review remain required and unclaimed.

25. Task 1: Ruling: use a random leaseToken in addition to leaseUntil — time-only leasing cannot fence a paused old worker after another process recovers the job; cost: one additive field and token checks.

26. Task 1: Ruling: interpret “最多3次自动重试” as initial attempt plus three retries (30s/2m/10m), terminal on fourth failure — the brief's third-failure test contradicts its three retry delays; cost: one additional bounded 90s model attempt, still single concurrent job.

27. Task 1: Ruling: abandon generated-cache symlink; Turbopack recreates relative external-package aliases against cache ancestry, making out-of-project .next invalid. Recreated a clean real ignored .next in the worktree; no shipped config or ignore changes.

28. Task 2: Ruling: keep a confirmedDictionaryId separately from unique senseKey — two confirmed matches with conflicting manual corrections must remain distinct, not fail a uniqueness constraint or lose corrections; cost: one additive field. Explicit merge rejects incompatible manual corrections and uses the target card schedule, preserving all source cards/logs archived in place.

29. Task 3: Ruling: count validated analysis results at stable source CFIs/PDF paragraph offsets (including a cache hit at a new position), not highlight painting; server parsing also indexes stable section paths. Prefer a complete parsed-material namespace per document over reader positions to avoid counting the same material twice. Counts describe processed material, not reading repetitions or all uploaded books.

30. Task 3: Ruling: moved only the isolated reader-learning worktree to /private/tmp/deepreader-learning-20261001-native after generated .next duplicate files recurred in Documents. Repeated type conflicts were synchronized generated artifacts, not source errors; all code, runtime and ledgers preserved, primary checkout untouched. Cost: local artifact paths changed.

31. Task 4: Ruling: use a separate fixed-purpose streaming semantic validation call after structural validation, at most one complete repair; article drafts remain explicitly unvalidated, replacement comes as a public stage/unit rather than concatenation. Source sense revisions are rechecked in the final write transaction. Cost: two model calls normally, at most four on repair.

32. Task 4: Ruling: bind in-process concurrency/rate maps to the Prisma client via WeakMap; per-app singleton still shares limits while isolated fixture databases do not leak counters. Across app processes active generating task is claimed transactionally and stale work is recovered after the 180s deadline.

33. Task 5: Ruling: application task uses the first 2–3 selected targets explicitly, separate from up to 12 reading targets; return only their IDs publicly. Generation and independent validation receive that exact subset. Judge and save usage evidence only for the application subset, so omitted passage words are not falsely marked failed.

34. Task 5: Ruling: hint use is persisted server-side on the task and rechecked when saving feedback; a client false flag cannot downgrade it. A dispute preserves the original feedback/evidence with disputed=true, never touches FSRS.

35. Task 6: Ruling: run the one fresh whole-branch review inside the final task before publishing, rather than after its deployment completion line — review is a prerequisite to safe main/server mutation; all earlier tasks are complete, code is frozen for review. Cost: final task ledger remains in progress until live gates pass.

36. Final: Ruling: observed forms are non-exhaustive; independent validator may approve a new English/Spanish morphological surface only when that exact surface occurs in the passage and the supplied meaning is correct — accommodates valid irregular/conjugated forms without invented suffixes. Cost if wrong: model linguistic judgment can err; unknown/ungrounded evidence fails and one repair remains bounded.

37. Task 6: Ruling: Ubuntu has venv but no ensurepip; bootstrap a SHA256-pinned official pip 25.2 wheel only inside app .runtime/frequency, bounded download and no-index install, rather than apt/system pip. Cost if wrong: app-only runtime installation fails closed, original app remains unchanged. Missing-pip and corrupt wheel test RED→GREEN.

## Deferred minors

- “今日完成”目前按当前复习会话计数；持久化自然日统计延后，刷新或切换可能重置显示，不丢失已保存的实际评分日志。
