# Thread 10: absent_null (2026-11-22)

Branch `20261122-absent_null`, PR #853, stacked on #833. Proved: see the PR's **Tests:** line.

The Coach and the orchestrator agreed the shape of a get's answer: `nil` over live, gone and void answers `gotlive`
(`val` the record), `gotgone` (`val` null, `dbhas` the tombstone) and `gotvoid` (`val` null, `dbhas` null); `fail` over
gone and void refuses `gone` and `void`, no `val`, `dbhas` the tombstone and null. Two changes from before.

* **Built**
  - `Absent`, `isAbsent` and the "told by shape, never by identity" rule are gone from `shapes/shapes-thing.ts`, from
    `safebyok`, `safebyok/storage` and `core`. `val: Absent` is `val: null`, `isAbsent(x)` is `x === null`, and
    `ThingRecord | Absent` is `ThingRecord | null`, in the minder's item and answers, `newer-thing.ts`,
    `bank-minder.ts`, `models/vault.ts`, `shapes-minder.ts`, and safebyok-react-lean (`giver-defaults`, `use-draft`,
    `react-giver`'s `BoxShown`).
  - `gotvoid` carries `dbhas: null`: `answerOf` in `storage/adapter-vault-db.ts`, `GetThingAnswer` in
    `storage/vault-db.ts`, `GotAnswer` in `shapes/shapes-minder.ts` and the minder's `gotAnswerOf`. The battery's and
    the minder's "answers gotvoid" tests pin it.
  - The minder's class doc block states the Coach's invariant: a good get or `tryAt` answers what the item holds.
  - VOCABULARY.md drops the **Absent** row and rewords **dbhas**, **item** and **dead entry**; `notes/answer-contract.md`
    says a get's `gotgone` and `gotvoid` have a `val` of null and carry `dbhas`. Empty changeset: both packages private.
* **Decisions made**
  - `absentCitedOf` became `nullCitedOf`, and reads `answer.dbhas ?? Shell.Cited`, which `gotvoid`'s `dbhas: null` now allows.
* **Discoveries**
  - Two `??` chains had relied on Absent being non-nullish, and null is not: `Minder.#doGet`'s `this.#itemAt(scoped) ?? fetched`
    would have returned the stale fetched record over a null item, and `Vault.#soonestAt`'s `soonAt ?? at ?? await get`
    would have fetched where the item is null. Both now test `=== undefined`, TanStack's cache miss, which is why null and not undefined.
  - The invariant's wording is narrowed to hold in the base case: `gotlive` carries no `dbhas`, so "where `val` is null, its `dbhas`...".
    `get` returns only the record, so only `tryAt` shows a `dbhas`. No path breaks it.
  - `safebyok-big` has its own `Absent`-named words (`absent_vault`, `ifAbsent`) and was left alone.
