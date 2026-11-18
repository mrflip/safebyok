# lean_middle: handoff (2026-11-18)

The workshop on safebyok's first two layers goes on: every vaultDB verb and record type working, and the ThingMinder
(vaultDB, TanStack Query's cache, and the observers) a joy at both ends. It runs as a `/workshop`
(`.claude/skills/workshop/SKILL.md`). The earlier thread is `whiteboard/20261115-lean_buttonup/`: its `complete.md` has
the rulings, today's at the end of the `structuralSharing` item (uncommitted in the base checkout), and its `handoff.md`
the state before today. The classifier code (`storage/thing-classifier.ts`) belongs to another session: leave it.

## How the Coach wants the work run

- **Consensus before change.** A question is a check, not a hint (`#earnest-question`): answer it on its merits, and act
  in the same turn when the answer is clear. Move only for a reason you can name; a forceful message is not one.
- **Take it slow.** Change nothing the Coach has not ruled on, and commit or push only when told. "Make the change" and
  "sweep it into your branch" are go-aheads; a ruling alone is not.
- **Rounds go to a thread-worker** (opus), briefed by `notes/supervising.md`; small edits are yours. A worker's report
  goes to the Coach whole, one item per deviation, with your reading.
- **The Coach's text is not sacred.** Fix it and say so. "X is great" marks the target shape, not code to keep.
- **The Coach fingerpaints in the base checkout** (`/workspace/byok`). Snapshot before sweeping, carry their intent, fix
  what is wrong, push back where you disagree, and hold what has large costs.

## Where things stand

- **PRs, both out of draft, labelled `ci`, bases on main:** [#722](https://github.com/mrflip/safebyok/pull/722) (the
  base sweep, a91fed4c1) under [#724](https://github.com/mrflip/safebyok/pull/724) (`20261118-minder_paint`, 7e26578fc,
  worktree `/workspace/byok-minder_paint`). Merging #724 with a merge commit lands both. `pnpm justify` green at
  7e26578fc (safebyok 1006, big 3025, react 281, e2e 576). #724 carries the fingerpainting rework and today's rulings:
  `bestCarOf`, `carOf(newest, fullest)`, `isTombstone`/`isGone`/`isWholeRecord`/`isTombstoneLifeseq`, staleness
  (timely only where the vaultDB has nothing newer and `isStaleByTime` says so; `MaxTimerMillis`, 588 hours; undefined
  options mean no opinion), `AskChecks`, `#tsqQueryOptions`, the `dubdel` docs, VOCABULARY's am, del, sparse and void.
- **The base checkout** is on `20261113-crypt_plan` at 7e26578fc, with, uncommitted:
  - the Coach's `Shells` section in `packages/safebyok/src/storage/shapes-thing.ts` (`scopedWithParentage`,
    `lifepathWithParentage`, their comment "this is unreadable. What does parent == undefined mean?"), as they wrote it
    but `bad_option` read as `bad_record`. It does not compile. The Coach will explain its intent.
  - today's rulings in `whiteboard/20261115-lean_buttonup/complete.md`.
  - a React session's minder giver (`packages/safebyok-react/...`, `pnpm-lock.yaml`): not ours, leave it.
- **Snapshot of the fingerpainting:** `whiteboard/20261115-lean_buttonup/fingerpaint-20261117/` (in #722).
- **Rollback tags:** `20261118-crypt_plan-presync` (the base tip before the sync) and the older `20261117-*` tags.
- **Droppable:** the `/workspace/byok-base_squash` worktree (same commit as #722), the `review-thing_car` branch
  (pre-rebase copies of #716/#718), and the stash "thing_car: AskChecks exported…".

## Directed (2026-11-18, later)

Items 2 and 3 are built and pushed on #724 (173d2e6b1, justify green). Item 1 the Coach pulled out to keep it simple:
it is a TODO (1f6a0ad13), not built.

1. **Share a record's unchanged parts in `bestCarOf`.** The Coach's question: run `replaceEqualDeep` once, not over the
   whole car, to save the double evaluation and the fix-up after. The matchup that works: only the **fullest** has parts
   worth sharing (a sparse record's fields are flat; a tombstone is its life's only revision). Where the fullest came
   from `delivered` and `prior` has a whole record, `shared = TSQ.replaceEqualDeep(prior.fullest, fullest)`; a full
   car's newest is that same record (`newest === fullest`), so it takes `shared` too; a sparse newest takes nothing.
   Then `carOf(newestOrShared, shared)`. One call, no fix-up. Test: a newer gate revision on a full car keeps the old
   car's unchanged `wayins` by identity, and `newest === fullest`.
2. **`#shellAt` uses an instance getter `rootBox`.** The Coach: "make an instance getter rootBox that throws if it's
   null. use that; do not error check in the method." Add `rootBox` to `MinderFriend` (`Pick<Bank, …>`) and its check in
   `shapes-minder.ts`; `get rootBox()` on the minder returns the bank's; `#shellAt` is `shellOf(scoped, this.rootBox)`
   below a root, `shellOf(scoped)` at one. `complete.md` already rules "`#shellAt` reads the bank's root box". **Push
   back to raise:** the bank's `rootBox` is never null (a shell before birth), so a throw would be dead code; if the
   Coach meant the root box's cached car, that is the cold-get trap again. `Phrases.RootNotCached` and the test that
   expects it (`thing-minder.test.ts`, "rejects.toThrow(Phrases.RootNotCached)") go: a cold get of a child box now
   answers a void car in the root box's life. Remove the TODO "A get of a child box before the root box is cached can
   throw". Tell the React session: its `minder-bank.ts` friend needs a `rootBox`.
3. **`isShellWhole` is `isShellCitable`** (shapes-thing.ts, private; four refines).

Then the changeset line, `pnpm --filter safebyok` lint/typecheck/test, `pnpm justify`, `gh pr view 724 --json state`
before pushing, and a plain push on top.

## Next

- The Coach explains the `Shells` lines; then new work to make `shellOf` and `#shellAt` less hair-raising.
- `TODO.md` holds what was deferred: `bestCarOf`'s redo for sparse tombstones; void and gone in the minder (a void car
  holding no record, or folding void into gone); fine-grained invalidation (`sparseOk`/`gotsparse`, whether `'static'`
  has a use); whole tombstones from the vaultDB; a box birth not checking its parent is live.
- Not taken, and why: `Gone<RecordT>` and `ThingFields`/`sparseOf` renames (the Coach: don't change); a wontfix for an
  observer's own `structuralSharing` (the Coach: one doc line, "unspecified behaviour", is enough).
- Context: compact after this handoff, before the `shellOf` work.
