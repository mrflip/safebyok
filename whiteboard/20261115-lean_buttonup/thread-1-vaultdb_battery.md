# Thread 1: vaultdb_battery (2026-11-15)

Branch `20261115-vaultdb_battery`, PR (draft, pending), on main. Proved so far: `pnpm --filter safebyok`
lint, typecheck, 746 tests, build (attw and publint clean). Postgres not yet built.

## Why Postgres redoes the classifier's work

Two reasons, in my words. First, the store's code is where the security boundary is: the adapter's TypeScript
runs in the page, beside whoever controls the page, so anything it decides (that a write is allowed, that a
cite still matches) is a claim, not a check. The SQL that runs in the database is the only code a hostile page
cannot edit. Second, only the UPDATE's own WHERE sees the row it is about to write over: a SELECT, then a
write, leaves a window in which another writer moves the row, and Postgres re-evaluates an UPDATE's WHERE
against the newest row version after it waits on a concurrent writer's lock, which no earlier SELECT does. So
the SQL repeats every check the classifier makes, in the WHERE of the statement that writes. Never "simplify"
the SQL by trusting the adapter's classification, and never add a SELECT-then-write.

PGlite has one connection. The battery can prove a birth writes all three roots or none, but it cannot race
two births, so how racing births behave (below) is argued, not tested.

* **Built**:
  * `src/storage/`: `MaxLabelsUnder = { bank: 0, gate: 0, box: 1 }` in `shapes-thing.ts`, so a gate or the
    bank has no labels beneath it and a box at most one; the main gate is the only gate, and its del is
    refused as `bad_record`. `world: BankRecord | null` on every answer and notice (`vault-db.ts`), computed by
    `worldOf(scope, roots)` (`thing-classifier.ts`) from roots read in the same step; null where a root is
    missing or fails its checks. `BankRecord` and `bankRecordOf` moved into `shapes-thing.ts` (re-exported
    from `models/bank.ts` and `safebyok/storage`). A notice handler that throws reaches `onBadNews`
    (`adapter-vault-db.ts`), as itself if a `VaultError`, else `unexpected_error`. `MemoryVaultDB`'s watch
    words: `Watcher`, `#watchers`, `#notify`, `receive`.
  * The battery: `tests/test-helpers/vaultdb-battery.ts` and its parts (`-writes`, `-lists`, `-births`,
    `-world`, `-watch`). `describeVaultDBBattery(label, { makeVaultDB, _cheat_rowsOf, watches? })` registers
    every case over a fresh vaultDB; `_cheat_rowsOf(vaultDB)` is the backdoor that plants or removes a stored
    row. `MemoryVaultDB` runs it (`tests/storage/memory-vault-db.test.ts`), keeping only its memory-only cases.
  * `safebyok/testing`: the lean core's test helpers and the battery, built from `tests/test-helpers.ts` as
    `safebyok-big/testing` is, with vitest an optional peer.
* **Decisions made**:
  * `world` rides on refusals too, read in the same step; null where the step throws.
  * The battery takes a backdoor (`plant`, `remove`) rather than reaching into a store's fields, so Postgres
    runs the same damaged-row and lone-root cases by plain INSERT and DELETE.
* **Deviations**:
  * The lease and proving cases that bound a lease to a gate at `gate/passkeys` are gone: no such gate can
    exist now. The ctx still binds the gate's labelpath; `ctx-bytes.test.ts` covers the bytes.

## Postgres: the plan, before it is built

* Per-kind tables (`safebyok_banks`, `safebyok_gates`, `safebyok_boxes`), the Thing's columns, `COLLATE "C"`,
  the Thing's CHECKs; no foreign keys, so the battery can plant rows independently.
* A write function per kind: the checks in the UPDATE's WHERE, or `INSERT ... ON CONFLICT DO NOTHING` over the
  shell; returns the verdicts and the world, and calls `pg_notify` on success. The adapter calls it only when
  the ask can write; otherwise a SELECT and the classifier. On a refusal the read-back row is classified.
* Policy SQL: the design's `wayins ? 'passkey0'` is wrong for our record, which always carries `passkey0`
  (JSON null for none); the check is `jsonb_typeof(wayins->'passkey0') = 'null'`.
* Birth: one function, one CTE statement: none of the three rows exists, then three plain INSERTs. A losing
  racer's unique_violation rolls the whole statement back and answers `storage_unavailable`. A race gets a
  row, not a fix; PGlite cannot test it.
