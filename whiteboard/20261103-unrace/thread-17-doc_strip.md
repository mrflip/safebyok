# Thread 17: doc_strip (2026-11-03)

Branch `20261103-doc_strip`, PR #463, stacked on #460. Justify: green, 6,978 tests passed, 220 skipped.

* **Built**: every doc block over the bound in `src/models/*.ts` and the named `src/storage/` files is one
  `/** SLOPDOC: ... */` line giving the purpose. Over the bound (over 240 characters of text, or over two lines):
  **55 of 449 before, 0 of 449 after**. All 55 fit one 120-character line, marker included; none took a second.
  `rg -n SLOPDOC packages/safebyok/src` lists them. 14 source files changed, 60 lines in, 214 out.
* **Moved to a `//`** (five, each one line on the line it governs; every other sentence simply went):
  * `models/box.ts`, in `#edit`: a whisper left out is unsealed and resealed all the same, as the stamp binds the sidecar.
  * `models/gating.ts`, in `attempt`: a clear is spent even when refused at the door.
  * `models/gating.ts`, in `#attemptOnce`: a correctable refusal, short of the last attempt, leaves the clears unspent.
  * `models/lease.ts`, in `peek`: a damaged row stands until the next lease is cached over it.
  * `models/vault.ts`, in `#vacateLease`: the lease goes first; the erase starts before any await, landing in call order.
* **Proof of no code change**: `A script, recorded in the PR body,` printed each changed `.ts`, base and tip, through TypeScript's printer
  with `removeComments`, so types stay in the comparison: 14 files compared with `20261103-bank`, 0 differ.
* **Decisions taken**: `models:` and `storage:` prefixes, one commit per file, as the log has them. Under-bound blocks
  stayed; none I passed only narrated parameters, and I passed few.
* **Discoveries**: no lint rule asks anything of a doc block, and no test reads the doc text of these files: `errors.test.ts`
  reads `errors.ts` only. No import lived only by a removed `{@link}`.

## Smells

Thirteen. Each wrote only with the job squeezed, or reads only by way of its callers. Worst first. The methods are unchanged.

1. `models/storable.ts:339`, `reconcileCentral`: its job is a table of life by age by shape, some 15 rows, plus a note on
   lives. "Judges" hides all of it, and the rows are the behaviour.
2. `models/listing.ts:189`, `deliver`: takes the world, delivers the record, picks which of two refusals to throw, tells the
   other as bad news, and applies an absent rule true only of a fetch. Five jobs called a pipeline.
3. `models/models-shapes.ts:142`, `boxDna`, `boxPatch`, `boxPut`: three contracts whose required, stripped and refused
   fields read only against each other and the round trip of a record; 30 lines of rules and examples went.
4. `models/box.ts:133`, `send`: an edit, a rebirth over a tombstone, and under `ifPresent: 'get'` a call that discards its
   patch and answers what is stored. Three jobs under one verb.
5. `models/vault.ts:366`, `putBox`: `send` where a box is held, a fetch first where the whisper is left out, a birth where
   none is stored, with its own opts split for each.
6. `models/listing.ts:210`, `#buildOrReceive`: builds, or receives, or replaces and vacates the old one, snapshots after, and
   refuses a late answer. The name itself says "or".
7. `models/box.ts:91`, `whisper` get and set: the setter exposes, or forgets by null, or forgets by LOCKED, seals nothing,
   and demands unlocked only on one branch. A property that does not act like one.
8. `models/storable.ts:95`, `assign`: `registered_at` is judged against the central `adopt` has yet to replace, so the method
   is right only by its caller's order.
9. `models/lease.ts:45`, `peek`: named as a look, and it erases a lease of another epoch or stamp on the way, while a damaged
   row and a row of another `vault_tok` stand.
10. `models/vault-listing.ts:80`, `ensureVault`: one line calling `putDraft`, with four sentences of doc before; it shares a
    name with `bank.ensureVault`, which does far more, and succeeds with another's vault, told only by `vault_tok`.
11. `models/vault-listing.ts:58`, `buildVault`: asks, stores, holds and unlocks, or answers another's vault locked; a lease
    refused past the put leaves it stored and held, locked. Two results and a half-way state.
12. `models/listing.ts:169` and `models/vault-listing.ts:134`, `del`: the base goes over the revision held unless a damaged
    entry names its own, and the override goes over `ante`'s own always. The revision is the point, and the two disagree.
13. `models/listing.ts:235`, `#makeThingOf`: born of the record's sparse form over a central never stored, a move that makes
    sense only by way of what `receive` then does with it.

## For the Coach

* **The table in `reconcileCentral` lived nowhere else** but an old thread file. It is gone with the block, as you asked;
  `git show bc37d226:packages/safebyok/src/models/storable.ts` has it at line 346. I recommend giving it
  a home in a spec or `notes/` only if the smell above survives.
* **Under-bound blocks still list refusals**: 57 of them name a `Refuses` in one or two lines. The bound let them stay.
* **Some under-bound blocks now point at a line that no longer says it**: `as {@link replacePassphrase} does` in
  `vault.ts`, `vault-listing.ts` and `vault-db-new.ts`, for instance, whose antecedent now gives only a purpose.
* **STYLE.md still says "Don't be stingy with `@example`s"** and asks more of a doc block than this ground rule does.
  `models/` now has no `@example` at all. STYLE.md wants the ground rule written in if it is to hold.
