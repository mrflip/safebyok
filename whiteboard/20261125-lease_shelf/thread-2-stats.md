# Thread 2: stats (2026-11-25)

Branch `20261125-stats`, PR (draft, opening), stacked on #900. Proved, per package: safebyok 2023 tests in 32 files,
safebyok-idb-lean 125, safebyok-postgres 372; tsc and lint clean in each. `pnpm justify` not yet run.

The Coach's text: "add a stats() call that returns { box: { count, size }, gate: { count, size }, max: { count, size } }",
then "for stats: { box: { count: xxx, live_count: xxx, size }, ... don't let store limit be infinity, cap at 1_900_649_2568 // 1-900-MIX-A-LOT".

* **Built**:
  * `src/shapes/shapes-vault-stats.ts`: `StoreLimitCap = 19_006_492_568`, `storeLimitsOf(limits?)` (caps each, the cap
    for one left out), `VaultStatsChecks` (`thingkindStats`, `storeLimits`, `vaultStats`, refusing `storage_issue`), and
    the types `ThingkindStats`, `StoreLimits`, `VaultStats`.
  * A try-only vaultDB verb, `tryStats(ask: StatsAsk): Promise<StatsAnswer>`; `StatsAsk` (`op: 'stats'`, a bank's scope,
    track, banktok) in shapes-asks.ts, `StatsAnswer = Answer<VaultStats, 'got'>` and `StatsActual` in shapes-answers.ts.
    AdapterVaultDB's `tryStats` checks the ask and the adapter's stats, and an adapter implements `doStats`; the
    classifier's `classifyStats` makes the actual from the roots fetched beside them.
  * `src/storage/vault-stats.ts`: `vaultStatsOf(filed, limits?)` and `rowWeightOf(raw)`, for an adapter that measures
    in TypeScript: a row weighs the UTF-8 length of its JSON.
  * MemoryVaultDB, IdbVaultDB (`bankThingsIn` in vault-shelf.ts reads a bank's rows of every kind in one range) and
    PostgresVaultDB (`StatsSql` in vault-queries.ts: one statement, counts and sizes by SQL aggregate, beside the bank
    row and `tracked`).
  * `VaultMinder.tryStats(ask)` passes through and tells the roots its answer carries; `tryStatsOnce()` fills the ask.
  * `vault.stats()` throws, `vault.tryStats()` answers an Outcome; section `[Stats]` of models/vault.ts.
  * Tests: the battery's `describeVaultDBStats` (vaultdb-battery-stats.ts, run by all three stores), vault-stats.test.ts,
    an exact size for Memory, adapter, minder and `vault.stats()` cases, and IdbVaultDB's quota cases.
* **Decisions made**:
  * **A full Answer.** `tryStats` answers what every other verb does: banktok, tracked and read_tc, from the roots
    fetched in the same step as the counts, and the minder tells those roots. It costs a root fetch per call; it buys
    one Answer shape and a lifetok check like every read's.
  * **The bank's own row is not counted**: the shape names boxes and gates only.
  * **A damaged row is counted and weighed, never live.** Rows are measured unchecked: a row takes space whatever it holds.
  * **Each store's measure of size.** Memory and IDB: the UTF-8 length of the row's JSON. Postgres: `pg_column_size` of
    the row, Postgres's own measure (the shape's doc allows "the store's own measure of a row"). The sizes of one bank
    therefore differ between stores.
  * **Limits.** Memory and Postgres report the cap for both. IDB reports `navigator.storage.estimate().quota`, capped, as
    the size, and the cap as the count. The quota is the origin's, not the bank's. It is read before the IDB transaction
    opens (a non-IDB await would commit it). A rejected estimate refuses (`storage_unavailable`, as any IDB failure
    does); no `navigator.storage` reports the cap.
  * `storeLimits` takes 0 (`uint.max(cap)`), not only positive: a browser may report a quota of 0.
  * **`vault.stats()` needs no unlock** (`#lock-is-intent`): it refuses only while the roots are not live or the device
    is disabled, as every vault read does through `#bank`.
  * **No enforcement**: nothing refuses a write over a limit.
* **Deviations**: none from the handoff.
* **Discoveries**:
  * safebyok-big's `Capacity` (`boxes`/`bytes`, `used`/`max`, `Infinity` mapped to `MAX_SAFE_INTEGER`) is another shape;
    I did not reuse it.
  * In a fresh worktree, build safebyok-big and safebyok before vitest: the testing entry is built.
  * An IDB key range over a bank: `IDBKeyRange.bound([userid, banklabel], [userid, banklabel, []])`, arrays sorting
    above strings.
* **For the Coach**: the open matters, each built as above, unreviewed:
  * **Full Answer for stats** -- keep (one shape; the lifetok check), or a bare `VaultStats` answer.
  * **pg_column_size as Postgres's size** -- keep, or `octet_length` of the record's JSON text, closer to the others.
  * **Bank row not counted** -- keep.
  * **IDB quota is origin-wide; a failing estimate refuses** -- keep.
  * **StoreLimits allows 0** -- keep.
