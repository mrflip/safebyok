# Thread 4: vault_writes (2026-11-20)

Branch `20261119-vault_writes`, PR #770, on main. Proved: `pnpm justify` green after the catch-up onto main 95f1a0425 (safebyok 1236 tests, 6539 across the workspace).

* **Built**:
  * `Vault` in `packages/safebyok/src/models/vault.ts`, exported from the front door `safebyok` beside the ThingMinder (not from `safebyok/core`, which carries no caching). `Vault.make(bank)` checks `bank instanceof Bank` (`Phrases.VaultBankExpected`) and makes its minder with `ThingMinder.make({ vaultDB: bank.vaultDB, queryCacheOpts: bank.queryCacheOpts }, bank)`. It does not call `hello`: make is sync and starts nothing, and starting belongs to startup. It has getters `bank` and `minder`, and is frozen.
  * `vault.putBoxOnce(cited | labelpath, patch, secrets)` seals with `bank.sealBox` and writes once through `minder.tryWrite`. Given a labelpath, it cites the car's `newest`: `minder.at`, else `minder.get`. `vault.delBoxOnce(labelpath)` does the same with `bank.tombstoneBox`. Both resolve the record as stored and throw the refusal.
  * `bank.sealBox` and `bank.tombstoneBox` now resolve a `SealedBoxAsk` (new, in `shapes-bankish.ts`): a `BoxWriteAsk & { record }`, the put ask for a live box or the del ask for a tombstone. It cites `Thing.sparseOf(donorProps)`, so an unsealed donor's whisper never reaches the ask. The lease's `seal` is unchanged.
  * `bank.vaultDB` is a new getter.
  * Removed: `bank.tryGetBox`, `tryListBoxes`, `tryPutBox`, `tryDelBox`, the `disabledAnswerOf` helper, `GetBoxAskDraft`, `GetBoxAnswer`, the `otherThanBox` thrower and the `GotOtherThanBox` phrase.
  * Tests: `tests/models/bank-flows.test.ts` moved (git mv) to `tests/models/vault.test.ts` and rewritten on the vault. Its tryGetBox-only cases were dropped: the minder's tests cover a get's refusals and other-Thing records, and sealBox's `record_conflict` tests cover another bank's records. bank.test.ts gains three ask tests (a put ask cited sparse, no whisper cited from an unsealed donor, a del ask). All sealBox call sites take `{ record }`.
  * `TH.buildBornVault(given)` in `tests/test-helpers/models-world.ts` calls buildBornBank, then `Vault.make`, then `minder.hello()`, and returns `{ device, bank, record, proving, vault, minder }`. Threads 7 and 9 should build vaults with it.
  * VOCABULARY.md's *vault* row gains the new core's sense after safebyok-big's. notes/security.md's lean_gate entry gains an amendment (sparse citation, the Vault's writes).
* **Decisions made**:
  * **The Once verbs throw.** STYLE says `putFoo` resolves what is stored and throws its refusal, and `tryFoo` resolves an Outcome. The brief's "answers what the vaultDB answered" could also be read as an Outcome. I took STYLE's reading; `#writeOnce` is the one place to flip it.
  * **The ask cites sparse**, so a whisper can never be cited (boxCited is strict anyway).
  * **The Vault takes the bank's own vaultDB** through the new getter, rather than `device.vaultDB` (the fudge I first planned). No `cheat…` method was needed.
  * **No `hello` in make.** The test helper calls it.
* **Deviations**: none from the brief, beyond the throw-vs-answer reading above.
* **Discoveries**:
  * **Try it first: it holds, on MemoryVaultDB.** Bank.put and the gate verbs still write through `vaultDB.tryWriteThing` themselves. A test wraps tryWriteThing and reads the minder's car at the moment the answer comes back. It finds the bank's (and main gate's) new revtok already there, for `bank.put` and for `launchReplacePassphrasePrompt`. Why: the written record is not a synthetic notification (the val "is the caller's to land"). It lands through MemoryVaultDB's own `#notify`, whose microtask is queued before the write answers. AdapterVaultDB.watch says an adapter's own notifications have no order or timing, so a Postgres or Convex adapter does not promise this. Only the synthetic ones (tracked, dbhas) are assured before the verb resumes. The test stands for MemoryVaultDB. Whether to route the Bank through the minder is the Coach's "later".
  * **A sparse newest needs a sidecar.** After `minder.list`, each car is `behind` or `bare`, and its newest is sparse. `putBoxOnce(labelpath, {}, secrets)` over it refuses `bad_record` (sidecar_missing), because a sparse donor has no sidecar to keep. A test pins this. Thread 9 (React) will meet it: right after a list, an edit that leaves the sidecar alone fails. Options: get when the car is not `full`, or pass the sidecar. I followed "a sparse record serves".
  * Writing the root box through the vault would leave `bank.rootBox` and its `track` stale. No verb does that yet.
* **For the Coach**:
  * **Throw or answer**: should `putBoxOnce`/`delBoxOnce` throw (as built) or resolve the Outcome?
  * **Sparse newest**: should putBoxOnce by labelpath get the whole record when the car is not `full`?
  * **Try-it-first on real adapters**: it holds only where the adapter's own notice is queued before the write answers.
