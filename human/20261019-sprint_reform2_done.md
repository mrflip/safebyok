# 2026-10-19: Sprint reform2 done -- ten PRs in one line on today's main; sixteen rows wait on you

The sprint ran the Coach's preplan (`whiteboard/20261019-reform2/reform2-preplan.md`) in one
session, YOLO, review at medium. The Coach struck threads 3, 4 and 5 early. Rulings added thread 9
(the damaged-retire warning) and thread 10 (the *visible* sweep). At wrap-up, rulings revived
thread 4 (`no_clear`) and added thread 11 (`refusal_rulings`). Every thread was built, reviewed by
its own `thread-reviewer` (thread 8 holds no code, so it had no review), and filed. They form one
line on today's `main` (`dbc3dfcc`, after #180), and every PR's base is `main`, so merging the top,
the sprint PR #175, merges them all. No review came back `flagged`. Two `fixed` reviews sent one
finding back to the builder (threads 4 and 11), and thread 11's code fix passed a second review.

The plan (`whiteboard/20261019-reform2/reform2-plan.md`) holds every gloss, ruling and *Review:*
line. The progress document holds what each thread found, and each thread file holds its build.
The rulings swept from the sprint doc are in `whiteboard/20261019-reform2/reform2-resolutions.md`.
The sprint doc is at https://claude.ai/code/artifact/62febfc3-47ee-4a7c-b99e-ea494b4b169c

## What shipped

* **A write answers with what it wrote.** `doUpdateBox` resolves to the stored lockbox, or to
  `null` when stale. Any other malformed answer is `corrupt_record`.
* **A retire names the revision it means.** It resolves to `retired`, `retired_other` or `absent`.
  `retired_other` is honored, with a warning.
* **A new refusal, `bad_record`, for a record a vault would never build.** A check of a whole
  record refuses `bad_record`, even when only its label is wrong; a check of a label alone stays
  `bad_label`. A retire's refusal says "Nothing was removed". GraphQL refuses an epoch past 32 bits
  as `bad_record` before sending.
* **A store over a damaged box is always one write.** A damaged lockbox that names no revision is
  refused as `damaged_lockbox`, so two stores can no longer silently retire each other's write.
* **New words.** *visible* means authenticated, never encrypted; *unencrypted* leaves
  authentication unsaid. The sidecar's example is the OpenRouter call count.

## The line, in merge order

Each PR's first line is the restacker's `Stacked as main -> ... (this PR)` line.

1. [#177](https://github.com/mrflip/safebyok/pull/177) returning (1): the bottom, on `main`. A write resolves to what it stored.
2. [#178](https://github.com/mrflip/safebyok/pull/178) retire_revision (2): a retire carries `revision_tok`, with honor-and-warn.
3. [#179](https://github.com/mrflip/safebyok/pull/179) bad_record (6): the new refusal kind.
4. [#176](https://github.com/mrflip/safebyok/pull/176) docs (7): the sidecar's trust class, and not overlapping one's own stores.
5. [#182](https://github.com/mrflip/safebyok/pull/182) summary (8): the release-note changeset (documents only).
6. [#183](https://github.com/mrflip/safebyok/pull/183) damaged_warning (9): `retireBox()`'s damaged-specific warning, with `damaged: true`.
7. [#184](https://github.com/mrflip/safebyok/pull/184) visible (10): the *visible*/*unencrypted* sweep.
8. [#186](https://github.com/mrflip/safebyok/pull/186) no_clear (4, revived): `storeBox()` is one `updateBox`; `damaged_lockbox` for a box damaged beyond naming.
9. [#185](https://github.com/mrflip/safebyok/pull/185) refusal_rulings (11): record checks refuse `bad_record`; "Nothing was removed"; GraphQL's 32-bit epochs.
10. [#175](https://github.com/mrflip/safebyok/pull/175): the sprint PR, squashed to one `plan:` commit. **The top.**

Beside the line, each cut from `main`:

* [#181](https://github.com/mrflip/safebyok/pull/181): the sprint skill's size-budget rule. You
  said "y" to its wording.
* [#187](https://github.com/mrflip/safebyok/pull/187): two TODO entries you ruled in: Postgres's
  loosely typed `InsertBoxOutcome`, and GraphQL's `'plain'` field class. They sit at the top of
  *Sand*, away from your uncommitted TODO.md lines.

## YOLO decisions still standing

Each has a `drafting` row in *Open Matters*. To change one, flip its row to `proceed` and write
your answer.

* **Both phrases for the sidecar stand** (the restack). Main's "guaranteed unchanged" stays in the
  README bullet and VOCABULARY's guarantee sentence; the trust-class entries say "authenticated".
* **GraphQL refuses an epoch past 32 bits as `bad_record`, before sending** (#185). The other
  choice was to carry epochs as `Float!`.
* **GraphQL's BAD_USER_INPUT stays `bad_option`** (#185). The client checks every record first,
  so a record at fault never reaches the server, and this refusal can only mean the server runs
  another schema version.
* **A name the floor admits but the backend cannot hold stays `bad_label`** (#185).
* **The store refusal reuses `damaged_lockbox`** (family `condition`) (#186).
* **Thread 4 edited the demo and two earlier changesets that it had made false** (#186).
* **The security note's "a new public field" for `trouble` is now "a new snapshot field"** (#185).

## Open, needing your word

* **`readBox()`'s message and doc block, and the `stale_write` retry, still advise a store over
  any damaged box.** For one damaged beyond naming, that store is now refused, and the refusal
  points to `retireBox()` (#186). Rec: the first wording to change when tombstones land.
* **The lost-write race still runs through an explicit `retireBox()`.** If B's listing is stale,
  B can retire, naming `null`, the fresh write A just stored. B gets a `retired_other` warning
  with `damaged: true`. The security note now says this is the residual risk until the tombstone
  rework (#186).
* **`prior_vault_key` is not yet classed** as visible or unencrypted (#184).
* **The core README's overview sentence reads in a circle** (#184).
* **Smaller items from #185's reviews:** the name floor is checked twice; the README's
  `bad_label` row is narrow; a huge epoch read back over GraphQL comes back
  `storage_unavailable`; the lockbox expectation's epoch is checked only by proxy.
* **Kept from your rulings for the design work:**
  * once a record exists there is always a record (tombstone or valid) while the vault exists;
  * an adapter's future answer is the record in the database when it returns, plus an
    explanation;
  * `unlock_epoch` "will be removed as a feature soon";
  * wayins can't be bound.
* **Thread 10's file still says "PR to follow".** Its last step was refused by the permission
  check, and I left the file as the worker's own record.
