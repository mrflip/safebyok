# Sprint gripe_followups -- plan

* **Date**: 2026-10-15
* **Mode**: YOLO
* **Review level**: medium
* **At once**: 2 threads
* **Issued by**: flip (the Coach), answering the open questions gripe_fixes left
  (`winboard/20261015-gripe_fixes/20261015-sprint_gripe_fixes_done-human.md`, on `main` since #82)
* **Status**: done -- one merge line main → #87 → #85 → #83; see `winboard/20261015-gripe_followups/20261015-sprint_gripe_followups_done-human.md`

## Read first

* `winboard/20261015-gripe_fixes/20261015-sprint_gripe_fixes_done-human.md` -- the questions these threads answer.
* `winboard/20261015-gripe_fixes/validation-survey.md` -- #70's survey of every entrypoint's
  validation (thread 2 builds on it).
* `TODO.md`, *Soonish*: *Pluggable label validator* and *Validating the user id* hold the Coach's
  earlier rulings on replaceable validation (thread 2).

## Ground rules

* Until 1.0 nothing binds backward: a tighter `user_id` bound needs no migration; the changeset
  says what a host sees.
* This sprint PR (`20261015-gripe_followups`) holds the plan, progress, the sprint's `human/`
  entry, the `/sprint` skill edit and `TODO.md`'s new entries. Threads do not edit those files.

## Threads

### 1. vault_amendments

The Coach, verbatim:

> In any case, cap user_id as min(1).max(100).
> yes erase can remove a corrupt box.
> Yes expose the default times

*Gloss.* Three small core changes, one PR.

* `user_id`: every schema that carries it (`types.ts`: `VaultScope`, the bundle and the lockbox
  shapes; `vault.ts`'s `openVault` check) takes `min(1)` and `max(100)`, from one shared
  definition; a refusal names the bound and never quotes the id. Convex's component validators
  and `getUserId` path get the same bound if they check `user_id` themselves. Changeset: an id
  over 100 characters is now refused at open.
* `erase()` on a lockbox whose record fails verification (`corrupt_record`) removes it rather
  than refusing; what `erase()` still refuses is unchanged. Tests: erase a corrupt box; the box
  is gone and the vault's other boxes are intact. `notes/security.md` gets a line if this changes
  what a tampered record can make the vault do.
* Default times: export the unlock-window constants the React package duplicates today
  (`ForeverMs` is `FarFuture - FarPast` in both `vault.ts` and `passphrase-modal.tsx`), and give
  the vault a way to report the window it was opened with, so `PassphraseModal` and
  `VaultProvider` stop being handed `forcePassphraseReentryHours` separately and stop
  re-deriving 168. The shape is the worker's call (a vault property, a snapshot field, or an
  exported accessor); it is public surface, so the doc block and changeset say so.

Depends on nothing unmerged: cut from `origin/main`. Touches `packages/safebyok/src/{types,vault}.ts`,
their tests, `packages/safebyok-react/src/{passphrase-modal,vault-provider}.tsx`, perhaps the
Convex component's validators. Size: `openVault` is at 16.61 of 17 kB; say if this crosses it.

### 2. validation_overrides

The Coach, verbatim:

> describe how we currently accept validations. My thought is to allow the customer to override
> a bag of defaults, and provide them with `z` and a base set of ones in a slashed export?

*Gloss.* A write-up, no code: `winboard/20261015-gripe_followups/validation-overrides.md`.

* **Today**: what a host can and cannot tune, entrypoint by entrypoint (from #70's survey):
  numeric options (`maxWhisperBytes`, `maxLockboxes`, `forcePassphraseReentryHours`), the fixed
  grammars (labels, `user_id`, `dbName`), the stored-shape schemas, and where each is defined.
* **The proposal**: a bag of default validators (labels, `user_id`, notes, limits) a host can
  override per field at `openVault`, built with `z` (zod/mini) re-exported from a slashed entry
  (`safebyok/validators` or similar) alongside the base set, so a host extends ours instead of
  writing its own. Weigh it against TODO's rulings (the label validator comes paired with a
  ckey stringifier; the user-id validator is replaceable) and say what must stay fixed (anything
  the stored format, ckeys or the cipher binding depends on), the tree-shaking cost, and whether
  a host's zod version can differ from ours. End with a recommended shape and the questions for
  the Coach.

Depends on nothing unmerged. Documents only: no review. Thread 1's `user_id` bound becomes the
default this design would let a host replace.

## Merge line

main → [#87](https://github.com/mrflip/safebyok/pull/87) (thread 1) → [#85](https://github.com/mrflip/safebyok/pull/85) (thread 2) → [#83](https://github.com/mrflip/safebyok/pull/83), the sprint PR, squashed on top.

## For the Coach

* Answered in chat, not built: does `Intl.RelativeTimeFormat` work for the dialog's unlock
  window, and where would a host inject a locale.
