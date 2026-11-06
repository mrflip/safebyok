# Sprint reform: paused 2026-11-06 05:15

Every unstarted thread waits on a merge. Nothing is broken; nothing is unfiled.

## Filed

| Thread | PR | Tip | Where it sits |
| --- | --- | --- | --- |
| 1 `vocab_sweep` | #518 | e96bbe792 | the Coach's line, on #512; the "ask, as a noun" commit on top |
| 2 `guarantees_pass` | #517 | 0cbf038d7 | the Coach's line, on #513; G2's core test and citation on top |
| 3 `example_pointers` | #522 | 51741eb57 | the Coach's line, on #521; the two review fixes on top |
| 4 `hello_listed` | #523 | 895949623 | on #513's current tip (7828cb089), not in the line; "Stacked on #513" |
| 11 `duck_calibration` | #525 | 781f7e625 | on main (374098121) |
| 12 `refusalof_removed` | #526 | 255d2c5d7 | on main; merge with or after #517 (guarantees.md's one mention of `refusalOf`) |

Each has its reviewer's comment on the PR and a `*Review:*` line under its entry in `reform-plan.md`. No worktree of
theirs remains. The sprint PR is #516.

## Waiting

Threads 5 (`module_clock`) to 10 (`kindvals_smush`) wait for #511 (`refusalkind`, `sanitizeForeignError`,
`damaged_rows`) and #513 (parse collapse) to reach `main`. They conflict with each other in
`packages/safebyok/src/refusals/throwers.ts` and `tests/test-helpers/models-world.ts`; the Coach's line resolves that
at #511's turn, on top. I did not restack them myself: the line is the Coach's.

## The Coach's line

`main -> #513 -> #517 -> #521 -> #522 -> #512 -> #518 -> #519 -> #520 -> #511`, from 04:31. Sprint PRs in it take plain
pushes on top only (plan, ground rule 9). #523 and #525 are outside it and may be slotted in.

## Open for the Coach (sprint doc, Open Matters)

TOP rows: old-core clauses in guarantees.md (F1, a follow-up thread); the validator sweep claim in G8 (F3, false as
written for keys; narrowing needs a yes); the deviceId privacy sentence (mid-edit); a deleted vault's Vault object (the
lifecycle wording, now in #518). Others: host guards and `refusalFor` (F2, thread 7), box's route to the lease (F5),
supplied-label check (F8), randomness in G10 (F9), `refusalOf`'s fate, `_takeListed` as a name, underbar methods and
entry validation, "world" in two senses.

## Hatches to know about

`eslint-disable-line unicorn/prefer-private-class-fields` on `BoxListing._takeListed` (#523), as the `_cheat_` methods
carry; `answer.val!` and `as never` in its moved test. Nothing else was added in this sprint so far.

## Cleanup owed (sprint doc, Cleanup)

The base checkout's branch reset once #512 merges; thread 5's directives (stale `FarFuture`/`ForeverMillis` prose, #511's
stale `VaultError` example, two stale comments in `storable.ts` and `errors.ts`); widen G8's seal list at #517's rebase;
`bad_whisper` mentions in notes/security.md; local prerebase tags; stale worktrees; the restack and the resolutions sweep.
