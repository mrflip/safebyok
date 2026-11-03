# Thread 6: store_switch (2026-11-03)

Branch `20261103-store_switch`, PR #454, stacked on #450. Justify: **red, by design of the stopping point.** `src/` typechecks and lints; `tests/storage` passes (52). `tests/test-helpers/models-world.ts`, `vault-world.ts` and the tests over them still speak of the `Store` that is gone (49 type errors, listed below). So the rewritten `src/models/` typechecks but **has never run**: expect the test rework to find bugs in it, not only in the tests. Stopped under the handoff's rule: two compactions before a first green means commit, write this file, report `blocked`.

* **Built** (all in `packages/safebyok/src/`):
  * `storage/vault-db-shapes.ts` is the one place for the stored shapes. `models/models-shapes.ts` rewraps its schemas under `bad_record` through `Checkers` (`am, revision, times, vaulted, sparseBase, tombstone, boxRecord, boxSparse, vaultRecord, vaultSparse`, the wayin forms, `gateProps`) and re-exports its constants.
  * `Store`, `BoxStore`, `VaultStore` are gone, with no adapter. `Listing` has five abstract methods, `tryGetRow, tryPutRow, tryDelRow, watchRows, isOwnRow`; `box-listing.ts` and `vault-listing.ts` implement them by calling `vaultDB.try*` and `watch` directly. `ListingOpts` and `BankOpts` take `vaultDB`.
  * `#deliver` reads its scope from `answer.req_params`, in place of `answer.scope`.
  * `ifPresent`: `box.send` passes it to `listing.put(duck, ante, { ifPresent })`, which sends it to `tryPutBox`, and the store decides through `PutTerms.mayReplaceLive`. A loser hears `camped`, or `declined` for `get`.
  * `format_mismatch`: each `damaged_records` entry says `damagekind`, `format_mismatch` for a row of a later `fmt`, else `damaged_record`. About 8 lines, tested in `tests/storage/vault-db-new.test.ts`.
* **Removed as obsoleted**: `MSX.answer`, `MSX.notice`, MSX's `Answer`, `Notice`, `Store`, `watchable`, `Checks.absent`; `isWatchable`, `watchableThings`, `priorRevisionTok`, `priorRevisionTokOf`, `fitsPriorRevisionTok`, `storedInStaleRefusal`; `Phrases.PutUnfitForPrior`, `AnswerOfOtherScope`, `LeftOutExpected`. `ifPresent: 'replace'` became `repl | fail | get`.
* **What remains**, for whoever finishes:
  1. `tests/test-helpers/models-world.ts`: `class TestableVaultDB extends MemoryVaultDB`, overriding `tryGetBox, tryPutBox, tryDelBox, watch` to log the same `ModelsCall`s (`priorRevisionTok` from `prior`, null for `VS.NeverStored`) and take the same `will*` scripts. Keep `ModelsWorld`'s method names so most tests needn't change. The world seeds a live, full vault row bearing `gate_epoch` under `WorldVault` through `_cheat_vaultRowsOf`, as box verbs refuse without one. `stored` becomes `_cheat_boxRowsOf(scope, vault_tok)`; `seedStore` sets into it. `answerOf`, `refusalOf`, `staleWriteOf` build real `GoodAnswer`/`BadAnswer`s (`act`, `meta`, `req_params: scope`, `dbhas`). `notify(record, world)` calls the captured `onNotice` with `{ act, val: record, world }`, and needs a non-null world row. `boxListingOf` passes `vaultDB: mw.vaultDB`. The default `del` over nothing stored now answers `void`, no revision-0 tombstone.
  2. `tests/test-helpers/vault-world.ts` (~line 81 has its own store), likewise over `MemoryVaultDB`, its fixtures with `gate_epoch`; `tests/loosened/{loosened,vault}.test.ts` pass `store`.
  3. `sed` `ifPresent: 'replace'` to `'repl'`. Delete the tests of what is removed: `MSX.answer`, `MSX.notice`, `watchedScopes`, `isWatchable`, malformed answers and notices (`notifyRaw`), answers of another scope, `PutUnfitForPrior`.
  4. A seeded sparse or `am:'d'` row now refuses `damaged_record` on fetch, as `tryGetBox` checks it whole: such a test scripts `answerOf`, or is dropped until thread 8.
  5. `recordOf(vaultInstance)` may refuse, as `Gate` here has no `gate_epoch`; check the tests of `listing.put(vault...)`.
  6. Use counts in `tests/models/`: `willGet` 28, `willPut` 20, `willDel` 7, `answerOf` ~33, `refusalOf` 5, `staleWriteOf` 16, `notify(` 10, `seedStore` 49. Type errors today: `models-world` 12, `listing` 10, `box` 8, `box-listing` 4, `models-shapes` 5, `vault-world` 3, `vault` 3, one each in `box-seal`, `storable`, `loosened`, `loosened/vault`. Do not read `tests/models/*.test.ts` through.
* **Decisions taken**:
  * Scope in `VS` stays where it is: scopes are not stored things.
  * Refusals deliver `dbhas` to the instance only for `stale_write` and `camped`; other refusals' `dbhas` is a vault row.
  * A notice is filtered by `isOwnRow`, as `watch` hears both kinds of row. `Vault.takeWorld` takes a row only under its own `vault_tok`.
  * The answer's shape is the vaultDB base's guarantee, so `MSX.answer`'s parse and the answer-of-other-scope check went. `#demandRecordOfScope` stays.
  * The vault listing drops `getVault`'s `boxes` and `damaged_records` until thread 8.
  * `listing.del` of a never-stored instance answers `void`.
  * `damagekind` is a new field, not a new `am`; no `errors.ts` change, so the changeset is empty.
* **Set aside**: an adapter class between listing and `VaultDB` (the handoff refuses it); reshaping the `am:'d'` tombstone for `format_mismatch` (reshapes more); a generic `ListingOpts` over the store's type (nothing varies now).
* **Deviations**: `am` on the models' `boxRecord` and `vaultRecord` is now `lit('a')`, as the storage shape has it. A local `PutUnfitForPrior` is gone, so an unfit `revision_seq` refuses `invalid_input` (`seqNotNext`), not `bad_record`.
* **Discoveries**: `VaultError`'s field is `refusalkind`, not `kind`. `Checkers` re-wraps a schema to change only its refusal kind, which is what made one set of shapes possible. Nothing in `box.ts`'s change touches secret material: `send` only passes `ifPresent` on, checked against `notes/guarantees.md`'s send and seal lines.
* **Restack with thread 3**: `gateProps` has `gate_epoch` optional, as `Gate` here carries none; `FirstGateEpoch = 1` stands in `models-shapes.ts`, and the draft and `#sendGate` stamp it. Resolve toward thread 3's required `gateEpoch`; the names meet in the same section.
* **For the Coach**:
  * **Crossing**: `get` seals before the store declines, and a `declined` send resolves `this` holding the live row with the whisper thrown away. No signal to the caller but the state; no machinery added.
  * **Two names**: `damaged_records` says `format_mismatch`, while `Refuse.newerFormat` on `getBox`/`getVault` still refuses `newer_format`.
