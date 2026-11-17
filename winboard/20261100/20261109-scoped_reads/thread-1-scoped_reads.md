# Thread 1: reads held to their address, damaged rows reduced to a scope (2026-11-09)

Branch `20261109-scoped_reads`, PR [#613](https://github.com/mrflip/safebyok/pull/613), stacked on [#612](https://github.com/mrflip/safebyok/pull/612). Justify green: core 2654, indexeddb 162, postgres 175, convex 279, fastkey 43, react 274, demo 96, graphql 339, e2e 454, scripts 311. `CI=true pnpm --filter safebyok build` clean.

Three commits, one per defect: A `088b31f7f` (a damaged row is its scope), C `b177f7dee` (`storage_issue`), B `93934d786` (rows held to their address). C comes before B because B throws it.

* **Built**:
  * **A.** `DamagedVault` is the vault's scope and `am: 'd'`; `DamagedBox` adds the boxlabel and `vault_tok`. `damagedVaultOf(scope)` and `damagedBoxOf(scope, vault_tok)` take no raw row, so nothing can read one. `damagekind`, `Damagekind`, `damagekindVals`, `format_mismatch`, `damagekindOf`, `isNewerFormat` and `fmtPeek` are gone with their exports and vocabulary. `rowPeek` and `peekOf` stay for `isRowAt`, `isLiveRow` and `isTombstoneRow`. `VaultListing.del` no longer tests `ante.am !== 'd'`.
  * **Dev inspector.** A `RevisionCells` component in `dev-vault-db-inspector.tsx` leaves the `revision_seq` and `written_at` cells blank for `am: 'd'`, with one test. Nothing else there changed; the getBox button stays, delBox stays hidden.
  * **C.** `storage_issue`, family `bad_news`, thrower `Refuse.storageIssue()`, phrase `StorageIssue`. The GraphQL enum and `crossedErr` derive from `refusalkindVals`, and Convex enumerates only its own `identity_revoked`, so neither needed an edit. No README enumerates kinds.
  * **B.** Private helpers in `storage/vault-db.ts`: `isRowFound` (null is absent, a non-object refuses), `foundVaultRowOf` / `foundBoxRowOf` (`parseConsistent` over the new non-null `SX.storedVaultRow` / `storedBoxRow`), `listedRowOf` (`safeParse`, then `verifyConsistent` on a pass, so no row is parsed twice). Used by `getVault`, `getBox`, both listings, the `found` of every unlanded put and delete, and `liveVaultOf`, so `#gateRowOf` and `#putMovedGate` come along.
  * **Battery.** Two new `describe`s in `vault-db-battery-gets.ts`, over every adapter; core grew from 2614 to 2654 tests across C and B. On the old `vault-db.ts`, 37 of the new cases in `tests/storage` and `tests/models/vault-boxes.test.ts` fail.
* **Decisions taken**:
  * A disagreement refuses `{ kind: 'record_conflict', message: Phrases.rowOfOtherAddress }`, so the message names the fields and blames the store, rather than the validator's generic words.
  * An `undefined` from a store refuses `storage_issue`: it is neither `null` nor an object. Adapters answer `null` for absent, and every adapter's battery passes.
  * The `{ garbage: true }` rubble keeps meaning damaged; a test that planted a scalar in `listBoxes` and listed it as damaged now plants that object.
  * `foundVaultRow` / `foundBoxRow` stay, nullable: `isVaultPutAllowed` / `isBoxPutAllowed` and the `safebyok/storage` export use them.
* **Deviations**:
  * **Vault rows are held to their scope, not to `vault_tok`.** The handoff said "the query or the record's scope and `vault_tok`". A vault row of another life at the same scope is a legitimate answer the verbs already have words for: `vaultMismatch`, `vaultEmpty`, delVault's void, rebirth over a tombstone. So `foundVaultRowOf` compares scope only, and a battery case pins getVault answering another life's row. Box rows are held to scope and `vault_tok`, since the address of a box row includes its life.
* **Discoveries**:
  * `watch`'s silent drop of a row that fails its check is untouched, as the handoff allowed. Nothing there compares a row with an address, and the watch scope is coarser than a row's.
  * `sparseBase`'s `am` still admits `'d'`, so `BoxSparse.am` can in type be `'d'` and `VX.isTombstone` still treats `'d'` as a tombstone. No sparse row can now carry it from a listing. Left, because `shapes-enums.test.ts` pins `amVals` and the handoff keeps the label.
* **For the Coach**: see *Open questions* on the PR: the `vault_tok` deviation above, and whether `record_conflict` should stay a `condition` now that it can fail a whole `vault.hello`.
