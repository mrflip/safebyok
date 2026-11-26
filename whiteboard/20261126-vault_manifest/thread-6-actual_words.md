# Thread 6: actual_words (2026-11-26)

Branch `20261126-actual_words`, PR #TBD, stacked on #943. Proved: see the PR's **Tests:** line.

* **Built**
  * **The sweep.** Bare "stored" in `packages/safebyok/{src,tests}` and the three adapters went from 540 to 309
    (safebyok 480 → 268, postgres 38 → 22, convex 14 → 11, indexeddb 8 → 8). Each use was sorted by the design's
    *Words* table: a row a step read or wrote, or an answer carries, is **actual** ("the actual record", "the actual
    Thing", `dbhas` "the actual Thing"); the row a write is judged against is **ante** ("the ante Thing" in
    `VaultDB.tryWriteThing`'s doc, `ThingOptions.policies`, `WriteAsk`, the device DB's `stowLease`); "stored" stays
    for the form a record takes at rest ("where none is stored", "stored unencrypted", `BankChecks.stored`). Where
    "stored" was the verb ("the write is stored", "a function that stores a record", "the birth stored it") it is
    now written or stowed.
  * **Renames** (none exported from a published package: `safebyok` is private at 0.0.0):
    * `BornAtNotStored` → `BornAtMoved`, `LifetokNotStored` → `LifetokMoved`: the refusaltags (`Refusaltag`, thread 8)
      and their phrases, whose text now says "leaves its born_at / its lifetok unchanged". Named like
      `ProvedWayinMoved`.
    * `refusedroot` → `refusedrootckey` (`CheckedBirthManifest`'s refused arm, `manifest-acts.ts`, `three-way.ts`).
    * `written` → `isWritten`: the local in `MemoryDatastore`, `IdbDatastore` and Convex's `component/things.ts`, and
      the parameter of `ManifestTags.writeTagsOf` / `birthTagsOf`. The manifest's `written` tag keeps its name (it
      is the datastore contract's field, and Postgres's SQL emits it).
    * `PerKindChecks.storedLifetok` (a pick, used only as `.shape.lifetok`) → `PerKindChecks.banktok`, the lifetok
      check itself; the design marked the `stored*` picks to go.
    * `device-db.ts`: `storedLeaseOf` → `checkedLeaseOf`, `storedReport` → `leaseReport`.
    * Postgres `vault-queries.ts`: the get, list and stats queries alias the table row `thing` (was `stored`); the
      outer column stays `actual`.
    * Tests: `cheatStored` → `cheatPlant`; a test's row put in place before a write is `ante`
      (`vaultdb-battery-writes.ts`, `-births.ts`, `devicedb-battery.ts`, `shapes-thing.test.ts`, `gating.test.ts`,
      and the flag table in `vault-minder-flags.test.ts`: `Storeds` → `Antes`, `dbhas=stored` → `dbhas=ante`); one
      planted behind the vault's back is `planted` (`vault.test.ts`, `vault-minder.test.ts`); one an answer carries is
      `actual`. `storedGateOf` → `actualGateOf`, `StoredCases` → `PlantedCases`, Convex's `storedIn` → `thingsIn`,
      `withGate(stored)` → `withGate(gate)`.
  * **VOCABULARY.md**: the **actual** row rewritten (it named the deleted `Actual` report), and new rows for
    **ante**, **proposed** and **manifest** beside it; the track, ask, options/policy, act/dbhas and policied rows say
    actual, ante or proposed where they said stored.
  * `.changeset/20261126-actual_words.md`: empty, for adapter authors.

* **Decisions made**
  * **The device DB uses the same words**, since the Coach's rule is "the same for every read or write": `stowLease`
    answers "the actual one", compared against "the ante lease record".
  * **"Stored" kept where it means at rest**, and so kept in: the World's "stored lease" (`#followStored`,
    `#peekStored`, `world.test.ts`'s `storedLeaseOf`): the lease record at rest in the deviceDB, as against the
    World's lease in memory; the proving's `stored` wayin (`ProvingParts.stored`, `buildStored`, `isStoredOfHeader`,
    `WayinOfOtherHeader`): VOCABULARY's "wayin, as stored"; `PasskeyStored` / `NoPasskeyStored` (a passkey at rest in
    the ante gate); `BankChecks.stored` and kin, per the table.
  * **"damaged" untouched**, `childrenStoredDamaged` and `ChildrenStoredDamaged` among it: thread 7 renames them.
  * **Tests' planted rows are `planted`, not `ante` or `actual`**, where a test plants a row and then both reads and
    writes over it; `ante` only where every use is a write's judged-against row.

* **Deviations**
  * A handful of `store`/`stores` as a verb went with the lines being edited (Postgres's write-function header, the
    birth comment, `WriteAsk`'s "The store compares", one test title). The rest of "store" (as a noun: "the store's
    limits", `StoreLimits`; as a verb: "the deviceDB stores") is not swept: it is not "stored", and the noun is
    named in `StoreLimits`, an export. Left for thread 10 or a ruling.

* **Discoveries**
  * `notes/` (`vault-adapter-contract.md`, `wontfix.md`, `storage-policies.md`) still say "stored" in places in the
    actual/ante senses; outside this thread's packages, so untouched.

* **For the Coach**
  * **`PolicyTag` → `PolicyRefusaltag`** not done: no ruling reached this thread.
  * **The deviceDB's "stored lease" kept** (above). If "actual" should reach it too, `#peekStored` and friends are
    private, and a rename is a few lines.
