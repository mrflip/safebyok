# 2026-10-17: Sprint push_to_100_a done -- nineteen PRs in one line on today's main; #138 waits on you

The sprint built the Gripefest matters into nineteen threads over two sessions (YOLO, review at
medium). Every thread but 15 is built, reviewed by its own `thread-reviewer` (no thread came back
`flagged` this session), filed, and restacked into one line on today's `main` (`365d1dcd`), each
PR's base `main`: merging the top, the sprint PR #125, merges them all. Thread 15 (#138, the
`KeyDeriver` abstract class) stays outside the line, waiting on your row. The plan
(`whiteboard/20261016-push_to_100_a/push_to_100_a-plan.md`) has every gloss, ruling and YOLO
decision; the progress document the lessons; each thread's file its build, review and rulings.
The sprint doc mirrors them: https://claude.ai/code/artifact/12453adc-57ea-4c47-9a4a-1425a670bb98

## The line, in merge order

Each PR's first line says "Stacked on #<the one below>, in the line main → ... → #145".

1. [#128](https://github.com/mrflip/safebyok/pull/128) names_and_keys (1) -- the bottom, on `main`
2. [#133](https://github.com/mrflip/safebyok/pull/133) public_bag (2)
3. [#127](https://github.com/mrflip/safebyok/pull/127) locks_and_expiry (3)
4. [#132](https://github.com/mrflip/safebyok/pull/132) refusals_and_catchup (4)
5. [#137](https://github.com/mrflip/safebyok/pull/137) epoch_expectation (13)
6. [#136](https://github.com/mrflip/safebyok/pull/136) secure_floor (10)
7. [#126](https://github.com/mrflip/safebyok/pull/126) crypto_small (6)
8. [#129](https://github.com/mrflip/safebyok/pull/129) react_tidy (7)
9. [#134](https://github.com/mrflip/safebyok/pull/134) uncontrolled_fields (14)
10. [#130](https://github.com/mrflip/safebyok/pull/130) ci_release (8)
11. [#131](https://github.com/mrflip/safebyok/pull/131) pg_container (11)
12. [#139](https://github.com/mrflip/safebyok/pull/139) store_base (5b)
13. [#142](https://github.com/mrflip/safebyok/pull/142) strength_principles (16)
14. [#141](https://github.com/mrflip/safebyok/pull/141) written_at (17)
15. [#144](https://github.com/mrflip/safebyok/pull/144) core_tidy (9b)
16. [#143](https://github.com/mrflip/safebyok/pull/143) sweep_small (9a)
17. [#140](https://github.com/mrflip/safebyok/pull/140) floors_forward (12)
18. [#145](https://github.com/mrflip/safebyok/pull/145) budgets (9c)
19. [#125](https://github.com/mrflip/safebyok/pull/125) the sprint PR, squashed to one `plan:` commit
20. [#147](https://github.com/mrflip/safebyok/pull/147) dialog_after_close (18), added at the
    closeout -- **now the top**: merging it merges the line. Its first line reads "Stacked on #125";
    the PRs below still name #145 as the end of their line.

Outside the line: [#138](https://github.com/mrflip/safebyok/pull/138) deriver_shim (15), stacked
on #126's old tip, unfiled in `/workspace/byok-deriver_shim`; and
[#146](https://github.com/mrflip/safebyok/pull/146) sprint_rules, from `main`, the first session's
process rules folded into #135's text (independent of the line; it adds
`whiteboard/20261016-push_to_100_a/thread-sprint_rules.md`, a file no other PR touches).

## YOLO decisions this session (20 to 30; 1 to 19 in the plan)

* **20.** 5 moved above 11, so the restack of 6-11 ran while 5b finished.
* **21.** The restack ran peer by peer (6, 7, 8, 11 onto 10 at once), then chained.
* **22.** The TODO/NOTYET entries you ruled were in neither file: 9a filed them, in your words.
* **23.** The provider's read after close went to 16, which fixed it at its cause.
* **24, 29.** 12 ran early, and filed without its tsdown half (tsdown 0.23.1 ages at 16:00Z).
* **25.** 12 had no code review (manifests and docs only); 9c likewise.
* **26, 27.** Reviews' small leftovers (the Hermes-safe guard, frozen `scope`, advice that
  rejects shows nothing) went to 9b.
* **28.** 9 split into 9a (sweep), 9b (code) and 9c (budgets); three drafting Recs taken into 9b:
  Postgres refuses a bundle that does not move `unlock_epoch` forward; `idbVaultDB` says
  `storage_blocked`; a failed zxcvbn load is `storage_unavailable`. Their rows stay, so you can
  object before merging.
* **30.** One restacker moved the line onto today's main and put your owed ruling lines into
  threads 1, 2, 3, 4, 13 and 10's files.
* **31.** This PR squashes to the sprint's documents only. The first session's `.claude/` rule
  edits (open matters to the Coach, rulings carried back, a resolutions file) move to their own
  small PR from main, [#146](https://github.com/mrflip/safebyok/pull/146) (`20261017-sprint_rules`), folded into #135's text; its `TODO.md`/`NOTYET.md`
  edits are dropped, superseded by #143's (the same entries, in your words, plus two).

## Open questions, in one place

* **#147 waits on you** (added at the closeout): keep the hand-rolled `useIsMounted` (Rec: yes;
  nothing existing does its job, and the libraries would be a runtime dependency for six lines),
  and a layout or a passive effect under it (a layout effect reads a dialog hidden by Suspense or
  `<Activity>` as gone, so an erase interrupted while hidden leaves its button disabled; Rec:
  passive, as the libraries do). Minor: `lib` ES2024 for `Promise.withResolvers`; the demo App
  tests' order dependence under shuffle. The provider's read after close (taken, below) had a
  sibling in the dialog: this is it.
* **#138 waits on you**: the row "An overridden deriveKeyBytes skips the 32-byte check". On yes,
  a fresh worker applies the reviewer's `keyBytesOf` fix, a second review covers it, and it
  restacks onto #126's new tip and joins the top of the line.
* **Open Matters** holds every other question as a row, `drafting` until you flip it. New this
  session: GraphQL and Convex grew; G304 maps every setup throw to `bad_option`; the ruled TODOs
  (taken); the epoch-forward check (taken); watch failures log raw errors; the provider's read
  after close (taken); TypeScript 7, `@types/node` 26 and `convex` 3 have aged; the carry-forward
  decipher; `storage_blocked` for `idbVaultDB` (taken); real browsers' blocked-storage errors (for
  you); 16's three design calls (no test refuses, lazy zxcvbn in `browserOpts()`, zxcvbn a normal
  dependency, not an optional peer); the advice hears every prefix; a zxcvbn load failure's kind
  (taken); `storage_blocked` on Hermes (taken); G344 (for you); the 1,024 allowance.
* **Still waiting from the first session**: G138's sweep (refused by the permission check: delete
  the row, or allow the write); `FOR SHARE` on real Postgres (explain).
* **Follow-up after 16:00Z today**: G403 and G415, the tsdown 0.23.1 move and the `dist/`
  comparison, a small thread from the line's top.
* **#124 and #143 meet** in `TODO.md`/`NOTYET.md`: both move RAGEBAIT to `NOTYET.md`.
* **`notes/security.md`**: main now inserts new entries at the top of *Of Interest*; the sprint's
  entries were appended at the end under the old rule, and stay there.
* **Folders for you to remove** (each unregistered by `git worktree remove`, then held by a
  `.DS_Store` Finder wrote; no git link, nothing unpushed): `/workspace/byok-ci_release`,
  `/workspace/byok-store_base`, `/workspace/byok-core_tidy`, `/workspace/byok-budgets`,
  `/workspace/byok-sprint_rules`.
* **Gripefest doc**: 71 matters now (its *Open Matters* header still says 132); G138, G344, G403,
  G415 stay open.
* **Your hands, from the first session**: `node-compat (22)` and `postgres` as required checks;
  the Dependabot secret check.
