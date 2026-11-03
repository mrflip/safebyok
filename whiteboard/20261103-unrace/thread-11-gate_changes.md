# Thread 11: gate_changes (2026-11-03)

Branch `20261103-gate_changes`, [PR #459](https://github.com/mrflip/safebyok/pull/459), stacked on #458. Justify: green, safebyok 4712 passed, 37 skipped.

* **Built**:
  * `Vault.replacePassphrase()`, `addPasskey()`, `revokePasskey()`, `delVault()`, each with a `try*`, on `Gating.launch` as thread 10's `build_vault` and `unlock_vault` are. `#landGate(proved, commit)` is the shared land for the first three, `#runDelVault(ante)` the delete's.
  * `models/gating.ts`: four new kinds (`gatingKindVals` is six), each a prove function in `ProveForGatingkind`. `timelyAnte(vault)` runs `ensureTimely(MSX.Promptly)` and hands back `vault.fullRecord` and `vault.gate`; params spread that record, so a change crossing another lands `stale_write` from the vaultDB, delivered first so the vault takes in the stored row. Clears are in `models-shapes.ts`: `passphraseReplaceClears`, `passkeyAddClears`, `passkeyRevokeClears`, `vaultDelClears`.
  * `same_passphrase` guard, `declineAtLock()`'s kind check (a `lock()` settles every kind but `del_vault`), bare `ArrayBuffer` prfBytes spent by `spendClears`.
  * `vaultListing.replacePassphrase/addPasskey/revokePasskey(params)` and `del(ante)`. `Listing.delOver(sparse)` is the base's delete, factored so the override can guard it.
  * `Gate` is read-only: `make`, `demandPasskeyAddable`, `pickle`, `toJSON`.
  * Tests: `vault-gate.test.ts` rewritten to the spec's rows (24); helpers in `vault-world.ts` return clears, not closures (`replaceTyping`, `addPasskeyTyping`, `revokeTyping`, `delTyping`).
* **Removed**: `Gate.attemptProof`, `with*`, `hearing`, `invokeClosure`, the models gate's `spendAnswer`, `GateChange`, `Vault#sendGate`, `ensureReadyToChangeGate`, `gateMovedUnderChange`, the `demandReadyToDel` override, the closure types and checkers and `gateAttemptArgs`/`passphraseReplaceArgs` and friends, `proofClosureOf`, phrases `ProofClosureThrew`, `GateChangeNeedsPassphrase`, `GateMovedUnderChange`, `NoPasskeyToRevoke`, and `repl` on public `putVault` (`#moveGate`'s internal `repl` stays).
* **Decisions taken**:
  * `listing.del(ante)` takes the record, not the spec's `del(scope, vault_tok)`: the spec's own "over the revision the gate was read at" needs scope, tok and revision together.
  * A stale instance of another life refuses `stale_write` (`Phrases.DelOfOtherLife`) with nothing asked of the vaultDB. Its `void` answer, delivered, would tombstone the slot's live vault locally. Set aside: asking the vaultDB and suppressing delivery, which makes a delete the one verb whose answer is not delivered.
  * `declineAtDiscard()` beside `declineAtLock()`: a goodbye or vacate settles any kind, `del_vault` included, as the vault is leaving.
  * `Vault.del()` is `delVault()`, with no opts: one door to delete, so no unguarded delete exists. Set aside: leaving Storable's `del` public beside it.
  * `Vault.fullRecord` is a new public getter over protected `demandFullProps`, as `Storable.full` is protected and `models/gating.ts` needs the record.
  * `putVault` keeps `'fail'` and `'get'`; default `'fail'`. `newdesign-vaultdb.md` lines 122-126 also strike `'fail'`, but the handoff names only `repl`, and a refusal for a put over a live row is worth keeping as the default. `camped` now wins over `stale_write` on a live row, so the test takes `camped`.
  * Listing verbs have no `try*`, to keep the surface small; the vault's `try*` carries the outcome.
  * An idempotent `revoked` with no passkey moves nothing, per the Coach's "we can switch if it's an issue".
* **Pulled forward / left**: nothing pulled. `newdesign-proof.md`'s *Guarantees to amend* and *Rows for `notes/wontfix.md`* are thread 14's (`shapes_sweep`) by the plan, so `notes/guarantees.md` lines 106, 144, 208 still name `spendAnswer`, and `VOCABULARY.md`'s and the README's change-passphrase passages are not moved. `src/gating.ts` (old code) still has its own `spendAnswer`; radioactive, untouched. `notes/security.md` took this thread's decisions (no session ended, passkey retained, params with no next gate, `del_vault`); the enter-key rule stays with thread 14.
* **Discoveries**:
  * Tombstones are made real with `delTyping` from another session; a hand-laid row misses the memory vaultDB's tombstone. `vault.fetch()` of a tombstone throws `vault_gone`.
  * `camped` from `addPasskey` is not reachable through a `Vault` in a test, as the revision moves with it; `vault-db-new.test.ts` covers it.
  * `vaultListing.put` with the base default `'repl'` refuses `invalid_input`; only `putDraft`, with `'get'`, calls it.
* **Crossings, raised not fixed** (no concurrency machinery):
  * `del_vault`'s `lock()` with a refused erase and no `onPanic` means `vault.vacate()` during the delete, and `listing.del` still lands. Recommend a `wontfix.md` row.
  * A watch-delivered tombstone between the commit and `this.gate` in `#landGate` refuses `bad_option`. Narrow.
* **For the Coach**: open matters are the PR's *Open questions*.
