# Thread 11: minder_members -- the VaultMinder's members, on `SortedVaultDB` (2026-11-24)

Branch `20261124-minder_members`, PR #877, stacked on #876 (base `main`). Design: "T1" in
[redistribution-design.md](redistribution-design.md), sections 0, 1, 3, 10, 11. Red on purpose: the same 18
`vault-minder` tests as #876 (listen 4, writes 2, staleness 1, 11 rows of `vault-minder-chains.test.ts`), diffed by name.

Proved: `pnpm justify` after the catch-up (as cut, onto #876's eb9a092fc): lint, typecheck, build clean in every
package; `safebyok` 18 failed (the same 18 as at eb9a092fc, diffed by name), 2110 passed, `ctx-bytes.test.ts` among
them. By hand at the same tree: `safebyok-idb-lean` 115, `safebyok-postgres` 356, `safebyok-react-lean` 320,
`safebyok-graphql` 448, `demo-dojo` 111, `demo-envman` 24, `demo-knockknock` 26, all passed.

Commits: `storage:` (the members), `storage:` (the ask's `track` is `known_roots`), `plan:` (this file and the design),
`storage:` (the entry points export `PutOnceArgs` and `DelOnceArgs`, which `forgotten-exports` asked for).

* **Built**
  * **Ask builders on the `SortedVaultDB`** (`src/storage/sorted-vault-db.ts`, `[Asks]`): `makeGetAsk(draft)`,
    `makeListAsk(draft)`, `makePutAsk({ cited, record, ...flags })`, `makeDelAsk({ cited, record })`. Each fills in the
    bank's scope; `banktok`, the bank Thing's `lifetok` while it holds a live record; and the roots' revisions
    (`known_roots`, was `track`), from the record each root Thing holds (`pickle()`), while all three hold a stored
    record (neither absent nor the shell). Either is left out where unknown, so asks at sign-in and before a birth carry
    neither, as `Device`'s did.
  * **Once verbs**, each a `try` body answering the vaultDB's whole answer and a thrower over it: `tryGetOnce(scoped)` /
    `getOnce(scoped): Promise<Thing>`; `tryListOnce(labelpath)` / `listOnce(labelpath): Promise<Kids>` (damaged rows to
    the listeners' `onBadNews` as `damaged_row`); `tryPutOnce(args)` / `putOnce(args): Promise<RecordT>` and
    `tryDelOnce(args)` / `delOnce(args): Promise<RecordT>`, whose `cited` defaults to `thingAt(record).citable`. A bad
    scope or record answers `refusedAnswerOf` from a short try/catch around the ask, never `outcomeOf`. Gets and lists
    ask `ifAbsent: 'nil'`, as the old minder did. No `stale_read`: the Thing's agerank decides news.
  * **`Bank`** loses `makeGetAsk`, `makeListAsk`, `makePutAsk`, `makeDelAsk`, `track` and `#roots`. `rootBox` reads the
    world's root box Thing (`World.rootBox`, made public), throwing `worldNotHeard` as before where it is not live.
    `put` checks the bank live (`absent_thing`, as before) and calls `putOnce`.
  * **`Device`** loses `makeGetAsk` and `makeListAsk`; `MinderFriend` loses both (the friend check reads `tellBadNews`).
  * **Writes through the `SortedVaultDB`:** `Bank.put`, `Gate.#putGate` (`putOnce`) and the birth (`tryBirthBank`), via
    the new `World.demandSortedVaultDB()` (refuses `absent_vault` before `signin`). `Vault`'s seal-then-write takes its
    put and del asks from the same `SortedVaultDB`.
  * **`Thing`**: `get agekind()` (`agekindOf`, exported from `src/storage/agerank.ts`); `citable` is the frozen Thing
    fields (`BaseThing.sparseOf`) of the newest revision seen; `receive` adopts nothing where the record equals the one
    held (`isEqual` from es-toolkit), so `pickle()` keeps its identity across a repeat in a later span.
  * **Deep freezing** (the Coach's ruling): `AdapterVaultDB` deep-freezes every record its answers and notices carry
    (`frozenAnswerOf`, `deepFreeze` from es-toolkit); never the ask, the refusal, or a caller's record.
  * `ReceivingThing` widens to `receive | agerank | agekind | citable | pickle`; `isSortedVaultDB` checks the new members.
* **Decisions made**
  * `putOnce` and `delOnce` resolve the record the vaultDB reports stored (`answer.val`), as the old `write` did, so
    `Bank.put` keeps its answer; `getOnce` resolves the Thing.
  * `known_roots` leaves out a root that holds the shell: the ask's check refuses revseq -1.
  * `Thing.adopt` keeps its shallow `Object.freeze`: a record that reaches a Thing other than through an
    `AdapterVaultDB` (a device database's `receive`, the roots restored from a persister, a test's `make`, a host's own
    vaultDB) is still frozen at its top, as before. Adapter records arrive already frozen, and it is a no-op for them.
* **Scaffolding:**
  * Scaffolding: the old minders take their asks from the `SortedVaultDB` handed at `hello` (`minder.ts`, `#askAt` and
    `#fetchListing`). T3 (the switch) removes it with the minders.
  * Scaffolding: the old VaultMinder tests' world (`tests/minding/vault-minder/world.ts`) gains `knowRoots(sorted)`, which
    has the minder's `SortedVaultDB` know the roots at revision 0, as the old fake friend's asks always tracked them. T4
    deletes it with those tests.
* **Deviations**
  * **`Bank.put` no longer forces labelpath `bank`.** It hands its record to `putOnce`, which writes it at its own
    labelpath; the old `makePutAsk` overwrote the labelpath with `'bank'`. A host calling `bank.put` with a bank record
    sees nothing change.
  * **Gate writes now carry `banktok` and `known_roots`**, as every ask the `SortedVaultDB` builds does. A vaultDB
    compares neither on a put, so no answer changes; the answer's `tracked` is now filled for them.
  * **Rename, the Coach's ruling:** the ask's `track` is `known_roots` (`KnownRoots`, `knownRootsOf`,
    `trackPairOf` → `knownRootOf`, `*StaleTrack` → `*StaleKnownRoots`), across safebyok and safebyok-postgres, the Postgres
    `tracked` function's parameter among them, VOCABULARY and `notes/wontfix.md`. It was never stored. The answer's
    `tracked` keeps its name. `notes/gallant.md` keeps a `#fetchThing(scope, track?)` line: gallant stays whole.
  * **Red tests, mechanical edits only:** `vault-minder-writes.test.ts` (a green test's put and del asks come from
    `world.demandSortedVaultDB()`; its `track:` is `known_roots:`) and `vault-minder-staleness.test.ts` (`track:` →
    `known_roots:`). The 18 still fail, the same by name.
* **Changed promises, quoted** (the rest of the changed titles only rename the builder's owner):
  * bank.test.ts, before: "reads its root box and its track from its world, as the world hears of newer roots"; after:
    "reads its root box from its world, as the world hears of newer roots". The describe "bank.track, and the asks the bank
    builds" moved to `sorted-vault-db.test.ts`'s "SortedVaultDB's asks: ..." (its six cases restated over the
    `SortedVaultDB`), and "track the bank a put through the bank wrote: its world has it" is now "leaves its world's
    asks tracking the bank it wrote, which the answer then reports the same".
  * memory-vault-db.test.ts, before: "answers with a copy, which the caller can change without changing the store";
    after: "answers with a copy of what it stores, deeply frozen, and stores a copy of what it is handed".
  * `citable`, before: the cited fields `{ lifepath, revseq }`; after: `BaseThing.sparseOf` of the newest revision
    (the Thing fields, sparse), in bank, gate and thing tests.
  * Removed: vault-minder-lifecycle's "refuses a bank that builds no get asks" and "... no list asks" (the friend no
    longer builds asks), and bank.test.ts's three ask rows in `RefusingCalls`.
* **Discoveries**
  * A root Thing holding the shell cannot be named in `known_roots`: the ask's check refuses revseq -1. So the asks leave
    `known_roots` out until all three roots hold stored records; the answer's `tracked` then comes only from asks
    after the roots are heard.
  * The old VaultMinder tests leaned on the fake friend always tracking the roots (and on a `storage_issue` over an
    empty store); hence the `knowRoots` scaffold.
  * The Postgres tests read the core's `dist`: rebuild `safebyok` before running them, or a renamed ask field is
    stripped by the old checks.
* **For the Coach**
  * **`tracked` beside `known_roots`.** It reads a little oddly: the ask says what it knows, the answer says "tracked".
    Suggest `roots_newer` (or leave it), held lightly.
  * **`putOnce`/`delOnce` resolve the stored record, `getOnce` the Thing.** Recommended: keep, so `Bank.put` keeps its
    answer; T3 may want the Thing.
  * **`Thing.adopt` keeps its shallow freeze**, for records that reach a Thing outside an `AdapterVaultDB` (a device
    database's `receive` freezes a host's event `val` at its top, as before). Recommended: keep until those paths go.
  * **Renaming the Postgres function's parameter** makes `CREATE OR REPLACE` fail over a database installed before it
    (Postgres refuses to rename an input parameter). No back-compat is owed; noted for anyone with a dev database.

## After the report: the ask's field is `track` again

The Coach (2026-11-24): "known_roots was my suggested name for whatever in `device` or `world` was supplying the value
for `track` in ask. ask's field should not be renamed." So the rename of the ask's field is reverted, in the core and in
`safebyok-postgres` (its SQL function's parameter is `track` again), and the `SortedVaultDB`'s getter `knownRoots` is
what supplies an ask's `track`: the revision of the whole record each root's Thing holds.
