# Thread 5: get_answer (2026-11-22)

Branch `20261122-get_answer`, PR #850, stacked on #847. Proved: `pnpm justify` green at `4a6eafc2c`, after the catch-up
(safebyok 1444, safebyok-react-lean 306, safebyok-idb-lean 124, safebyok-postgres 351, e2e 576, every other package and demo green).

* **Built**
  * `Absent` and `isAbsent` (`shapes/shapes-thing.ts`, exported from `safebyok`, `safebyok/storage` and `core`):
    `Object.freeze({ modelkind: 'absent' })`, recognized by shape, never by identity. The shell stays, only as what a
    write cites (`Shell.of`, `Shell.Cited`).
  * `GetThingAnswer` (`storage/vault-db.ts`): `gotlive` carries the record; `gotgone` carries `val: Absent` and the
    tombstone as `dbhas`; `gotvoid` carries `val: Absent` and no `dbhas`. `AdapterVaultDB.answerOf` builds them;
    `notifyDbhas` now also tells a good `gotgone`'s tombstone (the feed principle: everything an answer shows is heard).
  * The minder (`minding/minder.ts`): the item holds the live whole record or Absent; a new **dead** entry
    (`deadQueryKey`, kind `'dead'`, mark `'+'`) holds the newest tombstone heard of, set before the item lands Absent.
    `#itemRecordAt` is the record an item compares as (the live one, else the dead one); isOlder/isNewer, `#soonestAt`,
    `#isBehindAt` and `#markBehinds` read it. Public `deadAt(scoped)`. `at`, `get`, `tryGet` answer `ThingAt | Absent`.
  * Stale read (`#fetchRecord`): an Absent answer compares as its `dbhas` (gotgone) or as `Shell.Cited` (gotvoid).
  * `newerThingOf(prior, next, deadAt?)` (`minding/newer-thing.ts`): passes anything that is neither a record nor Absent
    to `replaceEqualDeep` (TanStack shares `select` results through it too); Absent compares as the tombstone `deadAt`
    finds at the other value's scope, else the shell; of two Absents, `prior`.
  * `GotAnswer`, `ThingEvent`, new `DeadEvent` (`shapes/shapes-minder.ts`).
  * Readers that followed: `BankMinder.rootBox`/`worldAt`/`fetchWorld`, `Vault.#demandReadableThing` and `#soonestAt`;
    in react-lean `newerOrSharedOf` and `recordQueryDefaults` (take the query's labelpath and `deadAt`), `liveOf`
    (null for Absent), `BoxShown`, and `use-draft`'s `isBehind` and the citation of its `put`; the idb bridge
    (`cachedRecordOf` stores item and dead successes, never Absent).
  * Ride-along: `docs/guide-react_query.md`'s `useBoxList` comment matches its doc block.
* **Decisions made**
  * Named `Absent`, discriminated by `modelkind`, as `Kids` is and as `absent_box` reads.
  * `BadAnswer.dbhas` stays `ThingRecord | null`: a refusal's dbhas is always another record than the (absent) val.
  * Write answers are unchanged: a `del` still answers the tombstone as its `val`. `ThingNotice` unchanged.
  * The dead entry is never removed when the Thing is born again: the live item outranks it everywhere it is read.
  * The minder's abstract `rootBox` went with `#shellAt`; a put's shell now comes from `Vault`
    (`Shell.of(scope, bank.rootBox)`). `VaultMinder.rootBox`, `BankMinder.rootBox` and VaultMinder's `bankMinder`
    opt stay, now serving only that.
  * react-lean's `newerOrSharedOf` needs the labelpath: under a pass-through `select`, a key change from a live box A
    to an Absent box B would otherwise keep A (a test pins it, and fails without the guard).
  * `use-draft`'s `put` over a pinned Absent cites the dead tombstone, else the shell, so its `stale_write` contract
    holds over a deleted box another device puts again (a test pins it, and fails without the branch).
  * `MinderEventFormat` not bumped: its comment says to take it as fixed.
  * Changeset empty: the core and lean packages are private; safebyok-postgres's public surface is unchanged.
* **Deviations**
  * Loosened: a get of a box not stored no longer refuses while the root box is uncached; it answers Absent. The doc
    clause went, and its test became "returns Absent for a box not stored while its BankMinder has no world".
* **Discoveries**
  * Rule (A), a child's first landing, is now "no soon, no dead, and the item undefined or Absent" before the landing;
    `#landedByFetch` never counts an Absent as a first landing.
  * The idb-lean battery runs `safebyok/testing` from dist: rebuild safebyok before testing it.
* **End states, for the final report**
  * A tombstoned bank or gate now makes `worldAt()` undefined (before: a world holding tombstones).
  * A gone root box makes `rootBox` the shell.
* **For the Coach**
  * VOCABULARY gains **Absent** and **dead entry**; **Void Sentinel** and **item** reworded.
  * Whether VaultMinder's `bankMinder` opt and the `rootBox` getters should go (they now serve only a put's shell).

Looked up in the plan: thread 5's section, and design lines 55-100 (*A get's answer*, *What reads tombstones today*).
