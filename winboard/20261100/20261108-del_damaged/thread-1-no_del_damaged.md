# Thread 1: no delete of a damaged row (2026-11-09)

Branch `20261109-no_del_damaged`, PR #610, cut from `20261108-box_deletable` (#607, since merged). Justify: green. Core 2582, react 273, convex 226, graphql 233 + 3 skipped, postgres 122 + 1, indexeddb 109 + 2, fastkey 43, demo 96, e2e 295 + 4, scripts 311, the old packages' suites unchanged; lint 368 warnings, no errors. `CI=true pnpm --filter safebyok build` clean.

The Coach (2026-11-09): "I predict too many bug reports about non-bugs ... remove the feature end-to-end." `notes/wontfix.md` holds the ruling, `del_damaged-spec.md` the design to start from if it ever returns.

* **Built**: nothing; removed. `vault.tryDelDamagedBox`; `boxListing.damagedAt` and the `del` override that existed to clear a `damaged_rows` entry; `absentDamagedBoxError`, `Phrases.damagedBoxAbsent`; `SX.isDamagedBoxAt`, `SX.isDamagedVaultAt` and their exports from `safebyok/storage`; the matching clause in `doDelBox` and `doDelVault` of the memory, IndexedDB, Postgres and Convex adapters. The dev inspector shows a damaged box row with `getBox` and no `delBox`. Docs: `VOCABULARY.md` (*boxlabel*, *damaged*), `notes/old_vocabulary.md`, the `delBox` / `delVault` doc blocks.
* **Decisions taken**:
  * `doDelVault`'s comment now reads "a live row of this life at another revision, or damage, stops the del whole"; the `isDamaged` stop stands, as directed.
  * The battery's three "named as `damaged_rows` lists it" tests become two refusals: a `delBox` of a row past peeking refuses at any prior, the void sentinels a listing would show among them; a `delVault` of rubble at the sentinels, or of a damaged tombstone at its own revision, refuses and tombstones no box.
  * `vault-boxes`' tryDelBox test now covers rubble as well as a peekable row: both refuse `damaged_row` and stand.
* **Set aside**: a test pinning that `vaultDB.delBox` still lands on a peekable damaged row at its peeked revision. It would enshrine the defect the Coach is about to rule on. The two `vault-listing` "leaves when the customer names ..." tests went with the feature rather than being reduced to that case.
* **Discoveries**:
  * The peek-based predicates are untouched. `isLiveRow`/`isRowAt` on a damaged row whose `am` and revision still parse (`{ ...record, whisper_ciphered: 'chewed' }`) let `vaultDB.delBox` and `delVault` land at the peeked revision, and let `isPutAllowed` land a put. That is the known defect.
  * `vault.delBox` on a damaged row refuses `damaged_row` at its hydrate, before any delete reaches storage, so the sentence in its doc that said a damaged box "reads as missing here" was wrong as well as stale. It is gone; `vault-boxes` pins the refusal for both a row past peeking and one with its peek.
  * `Listing.del` still has `(duck.am === 'd') ? null : this.at(scope)`, a branch that exists only for a damaged duck. Kept, as directed (`Listing.del` untouched). It leaves `vault.boxListing.del(damagedBoxOf(...))` a reachable caller: a row past peeking now refuses, and a peekable one lands by the peek defect.
  * `#607` merged while this was being built, so the base is in `main` and the PR's diff is this thread's alone.
* **Left in place**: `DeviceDB.delRawLease` and the device inspector's delete of a damaged lease row. It is a device-local cache on the host's own store, not named in the directive; see *For the Coach*. `notes/gallant.md` still quotes the body of `vault.tryDelDamagedBox`, for the gallant harvest.
* **For the Coach**:
  * Does `delRawLease` fall under "any library path whose purpose is to delete a row that fails its validators"? It is a host's verb over its own device store, and `listRawLeases` exists to reach such rows; I left it.
  * Is the `duck.am === 'd'` branch in `Listing.del` to go with the feature? It is dead weight once the Coach rules on the peek predicates; recommend removing it then.
  * `#608` is superseded by this PR.
