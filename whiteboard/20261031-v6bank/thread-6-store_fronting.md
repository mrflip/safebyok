# Thread 6: store_fronting (2026-11-01)

Branch `20261101-store_fronting`, PR [#429](https://github.com/mrflip/safebyok/pull/429), stacked
on #426 (thread 1). Justify: green, 7029 passed, 220 skipped, every package.

* **Built**:
  * `src/models/store-front.ts`, new:
    * `abstract class StoreFront`, with four storage hooks: `doGetRows`, `doSwapRow` (one
      atomic read-and-swap of a row, which answers the row it read), `doFindRows`, and
      `doWatch` (a noop by default).
    * `vaultStore(bankScope)` and `boxStore(vaultScope)` answer a `FrontedStore`, which is a
      models `Store` plus `delDamaged`.
    * `localStoreFront({ store })` serves the front from a `StringStore`, with JSON rows.
  * The front does the work, so an adapter only moves rows:
    * It checks a put or del against the stored `revision_tok` and refuses a stale one with
      `stale_write`, carrying the stored row (`Refusals.staleBox` / `staleVaultRecord`).
    * It computes `revision_seq` (prior + 1), `revision_tok` and `written_at`.
    * Its verdict comes from the row the swap actually read, so a race with another writer is
      judged on what was stored.
  * `del(scope, priorRevisionTok)` is conditional on `revision_tok`, and stores a 'x'
    tombstone. Over no row, with a null tok, it lands nothing and answers null.
  * `delDamaged(scope)` is the unconditional seam for thread 8: inside the same swap, it
    removes the row only while it still reads as damaged. It answers null where it removed the
    row, and what is stored where it did not.
  * Damaged rows: a row that reads as neither record nor tombstone, or whose scope disagrees with
    its scopepath, is refused by name. A box row is `damaged_box` and a vault row is
    `damaged_vault`, both told as bad news. `get`, `put` and `del` all refuse it, and nothing
    is stored over it.
  * The watch: `Store.watch(onNotice, fullFor, onChange)` gains `onChange`.
    * The front's watch sweeps the store's rows each time the hook rings, and compares their
      `revision_tok`s with the last sweep. It pushes a notice for each changed row: full where
      `fullFor` names the scope, sparse otherwise, with the world.
    * It rings `onChange` when it cannot say what changed: a damaged or vanished row, a sweep
      refused, hook trouble, or a hook that throws synchronously.
    * `BoxListing`/`Listing` answer `onChange` with `hydrateAll({ maxMillisSinceRefresh: 0 })`,
      so each thing fetches again and meets the refusal itself.
  * New factories in `refusal-funcs.ts` (`[Stores]`), with phrases in `phrases.ts`
    (`[Models: stores]`): `damagedVaultRow`, `damagedBoxRow`, `scopeOutsideStore` and
    `storeRowsMiscounted`.
  * New checkers in `models-shapes.ts` (`[Store fronts]`): `storeFrontOpts`,
    `localStoreFrontOpts`, `storeWatchArgs`, `priorRevisionTok`, `storeRows` and `foundRows`.
  * Shipped: `Scopepath.withinBankScopepathPrefix` and `withinBankScopepathPred`, which the
    vault store sweeps by. `local-vault-db.ts` now exports `jsonOrText` and `getJson`, which
    the local front reuses.
  * Tests: `tests/models/store-front.test.ts` has 34 tests, ending with a `BoxListing`
    integration (a box delivered by the watch, and `identity_revoked` reaching the bank's bad
    news). The scopepath additions have tests in `tests/scopepath.test.ts`.
* **Decisions taken**:
  * **Signed-out is `identity_revoked`, not a new `signed_out`.** It already exists in the
    bad_news family ("signed out, or another user signed in"), and the old contract and
    refusal-policy already use it. A second kind would split one fact in two. A hook refuses
    it; `get`/`put`/`del` pass it through unchanged; the watch rings `onChange`, so the bank
    hears it from the fetch. For 7b, `kind === 'identity_revoked'` is the recognizer that
    `closeVaults` wires to. This is pushback on the orchestrator's note, raised as an open
    matter.
  * **A base class with its own hooks, not a wrapper over the `VaultDB` class.** The VaultDB
    verbs check the old shapes and gate on `vault_tok` expectations. Fronting them would have
    meant translating every record twice. Instead, the existing adapter packages gain a
    `StoreFront` subclass in a later thread; the old contract is untouched.
  * **The module is under `src/models/`.** It speaks the models' types, and placing it there
    keeps models code out of the shipped entry points until thread 11.
  * **The del tombstone is computed before the swap** (fresh tok, `clock.now()`), so the swap
    closure is pure and the verdict deterministic.
  * **The first watch sweep is silent.** A watch pushes only changes made since it began, which
    is what `hello` expects.
  * **The size budget is unchanged.** "everything" grows from 62.12 to 62.2 kB, and no rule
    moves. Every "raise" the script prints was already there on the base.
* **Rework after review**: `delUnparsed` became `delDamaged`, to match `damaged_box`,
  `damaged_vault` and thread 8's `delDamagedVault` (`DeviceDB`'s existing `doDelUnparsed` hook is
  untouched: it is not this thread's, and a host-facing abstract method). The changeset is
  trimmed to what ships: the two `Scopepath` exports, and a line that the store front is not yet
  exported from any entry point (still `minor`).
* **Deviations**:
  * **The del over no row now answers null**, per the Store doc I rewrote. The fake in
    `tests/test-helpers/models-world.ts` still lands a revision-0 tombstone there, and I left it
    alone (held: the listing's work).
  * **Storable's 'ouch' path** (`'d'` tombstones) is now reached only by a stored 'd' tombstone,
    because the front refuses damaged rows instead of tombstoning them. I updated the doc and
    held the code.
* **Discoveries**:
  * **A box answer's world is the raw vault row.** With that row absent or damaged,
    `Vault.takeWorld` refuses. This is thread 8's matter.
  * **Signed out while holding nothing**: no thing fetches, so no bad news arrives. A bank-level
    probe would be needed (thread 4 or 7b).
  * **A remote backend cannot run the swap closure in-process.** Its subclass will express the
    conditional put as the backend's own compare-and-set on `revision_tok`, and `RowSwap` is
    the local shape of that.
  * **The box store does no `vault_tok` gating**, which the old `putBox` did. Where that gating
    goes (thread 3a's gating, or the listing) is open.
  * **A local row written by the old `localVaultDB` reads as damaged** under the front, since its
    shape differs. Pre-1.0 that is fail-safe. (The changeset no longer says so: the front ships
    unexported, so no host can meet it yet. Thread 9's, or whichever exports the front, should.)
  * **Unverified**: a forced hydrate on a locked vault, after watch trouble, may tell
    `vault_locked` as bad news.
  * **Lib target**: it has no iterator helpers (`map.keys().some`), so a loop stands in.
* **For the Coach**:
  * Rule on `identity_revoked` versus a new `signed_out`.
  * Rule on `delDamaged` as the unconditional delete. The alternative is `del(scope, null)`
    meaning "whatever is there", which would lose the guard against deleting a good row.
  * Rule on whether the models-world fake should follow the del-null doc now, or in the
    listing's thread.
