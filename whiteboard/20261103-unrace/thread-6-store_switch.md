# Thread 6: store_switch (2026-11-03)

Branch `20261103-store_switch`, PR #454, stacked on #450. Justify: green (core 4587 passed, 37 skipped; `tests/models` and `tests/loosened` 987 passed).

* **Built** (all in `packages/safebyok/src/`):
  * `storage/vault-db-shapes.ts` is the one place for the stored shapes. `models/models-shapes.ts` rewraps its schemas under `bad_record` through `Checkers` (`am, revision, times, vaulted, sparseBase, tombstone, boxRecord, boxSparse, vaultRecord, vaultSparse`, the wayin forms, `gateProps`) and re-exports its constants.
  * `Store`, `BoxStore`, `VaultStore` are gone, with no adapter. `Listing` has five abstract methods, `tryGetRow, tryPutRow, tryDelRow, watchRows, isOwnRow`; `box-listing.ts` and `vault-listing.ts` implement them by calling `vaultDB.try*` and `watch` directly. `ListingOpts` and `BankOpts` take `vaultDB`.
  * `#deliver` reads its scope from `answer.req_params`, in place of `answer.scope`.
  * `ifPresent`: `box.send` passes it to `listing.put(duck, ante, { ifPresent })`, which sends it to `tryPutBox`, and the store decides through `PutTerms.mayReplaceLive`. A loser hears `camped`, or `declined` for `get`.
  * `format_mismatch`: each `damaged_records` entry says `damagekind`, `format_mismatch` for a row of a later `fmt`, else `damaged_record`. About 8 lines, tested in `tests/storage/vault-db-new.test.ts`.
* **Removed as obsoleted**: `MSX.answer`, `MSX.notice`, MSX's `Answer`, `Notice`, `Store`, `watchable`, `Checks.absent`; `isWatchable`, `watchableThings`, `priorRevisionTok`, `priorRevisionTokOf`, `fitsPriorRevisionTok`, `storedInStaleRefusal`; `Phrases.PutUnfitForPrior`, `AnswerOfOtherScope`, `LeftOutExpected`. `ifPresent: 'replace'` became `repl | fail | get`.
* **Test world**: `tests/test-helpers/models-world.ts` holds `TestableVaultDB extends MemoryVaultDB`, overriding `tryGetBox, tryPutBox, tryDelBox, watch` to log the same `ModelsCall`s and take the same `will*` scripts, else to fall through to the real verb; `ModelsWorld` keeps its method names, and seeds a live vault row. `vault-world.ts` runs over a plain `MemoryVaultDB`, with `restoreRow` and `wayinsOf`, as a stored gate has `gate_epoch` and `Gate.pickle()` does not.
* **Bugs the first run found**, both in the switch: `boxPatch` had `am: lit('a')`, so the round trip of a tombstone's record refused; it takes `oneof(amVals)`. `listing.del` read `sparseOf(box)`, where a box not full answers null for `whisper_codec`, so a second del refused; it reads the held box's `.sparse`.
* **`ifPresent`, `camped`, `declined`**: worked first time, now tested at `listing.put` and `box.send` over the real vaultDB.
* **Tests deleted**: `MSX.answer`, `MSX.notice`, `watchedScopes`, `isWatchable`, malformed answers and notices (`notifyRaw`), answers of another scope, and the fake store's put and del cell tables (`tests/storage` has the real ones). A record of another scope under the scope asked still refuses `bad_record`.
* **Decisions taken**:
  * Scope in `VS` stays where it is: scopes are not stored things.
  * Refusals deliver `dbhas` to the instance only for `stale_write` and `camped`; other refusals' `dbhas` is a vault row.
  * A notice is filtered by `isOwnRow`, as `watch` hears both kinds of row. `Vault.takeWorld` takes a row only under its own `vault_tok`.
  * The answer's shape is the vaultDB base's guarantee, so `MSX.answer`'s parse and the answer-of-other-scope check went. `#demandRecordOfScope` stays.
  * The vault listing drops `getVault`'s `boxes` and `damaged_records` until thread 8.
  * `listing.del` of a never-stored instance answers `void`.
  * `damagekind` is a new field, not a new `am`; no `errors.ts` change, so the changeset is empty.
  * `TestableVaultDB.watch` calls `super.watch`, so real notices reach a listing beside the scripted `notify`.
  * A seeded sparse or `am:'d'` row refuses `damaged_record` at the real verbs, so those tests script `answerOf` or `willDel`, until thread 8.
* **Set aside**: keeping the hand-rolled fake store as a second implementation (it had drifted from the vaultDB's verdicts; the real one is the test now); an adapter class between listing and `VaultDB` (the handoff refuses it); reshaping the `am:'d'` tombstone for `format_mismatch` (reshapes more); a generic `ListingOpts` over the store's type (nothing varies now).
* **Deviations**: `am` on the models' `boxRecord` and `vaultRecord` is now `lit('a')`, as the storage shape has it. A local `PutUnfitForPrior` is gone, so an unfit `revision_seq` refuses `invalid_input` (`seqNotNext`), not `bad_record`. Over the real verbs: a `del` of a box held alive that finds no row answers `void`, so it throws `record_conflict`, not `stale_write`; a `del` of a tombstone leaves it at its revision, and mints no new one; a notice under another `vault_tok` is passed over, not told to `onBadNews`; an answer with a null world takes none.
* **Discoveries**: `VaultError`'s field is `refusalkind`, not `kind`. `Checkers` re-wraps a schema to change only its refusal kind, which is what made one set of shapes possible. Nothing in `box.ts`'s change touches secret material: `send` only passes `ifPresent` on, checked against `notes/guarantees.md`'s send and seal lines.
* **Restack with thread 3**: `gateProps` has `gate_epoch` optional, as `Gate` here carries none; `FirstGateEpoch = 1` stands in `models-shapes.ts`, and the draft and `#sendGate` stamp it. Resolve toward thread 3's required `gateEpoch`; the names meet in the same section.
* **For the Coach**:
  * **Declined signal**: `get` seals before the store declines, and a `declined` send resolves `this` holding the live row with the whisper thrown away. No signal to the caller but the state; no machinery added.
  * **Damaged row**: `listing.fetch` throws `damaged_record` where it once received an `am:'d'` tombstone, and `tryDelBox` refuses the same, so a damaged box cannot now be deleted; the tests script both. Recommend thread 8 settles it.
  * **Two names**: `damaged_records` says `format_mismatch`, while `Refuse.newerFormat` on `getBox`/`getVault` still refuses `newer_format`.
