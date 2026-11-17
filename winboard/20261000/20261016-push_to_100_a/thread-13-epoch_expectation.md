# Thread 13: epoch_expectation (2026-10-16)

Branch `20261016-epoch_expectation`, PR [#137](https://github.com/mrflip/safebyok/pull/137),
stacked on [#132](https://github.com/mrflip/safebyok/pull/132), restacked onto its tip `f6d424ef`
(the line main -> #128 -> #133 -> #127 -> #132 -> #137). Justify: green -- safebyok 1781 passed /
33 skipped, indexeddb 165/10, postgres 244/13, convex 289/8, graphql 229/13, react 111, fastkey
44, demo 168/15, e2e 93/8, root 155. `pnpm size`: openVault 25.28 kB of 30 kB, everything
32.34 kB of 40 kB.

* **Built**:
  - **VAULTDB.md 3.8 in every adapter** (G065). IndexedDB: one more term in
    `lockboxMeetsExpectation` (`safebyok-indexeddb/src/expectations.ts`), inside the write's
    transaction. Convex: the component's `updateBox` mutation compares the bundle row's
    `vault_key_epoch`. Postgres: both lockbox statements read the bundle through one
    `ExpectedVaultSql` CTE, `... AND vault_key_epoch = $5 FOR SHARE`; the replace gained that CTE
    (it read no bundle before). GraphQL: the resolvers already pass the expectation whole; its
    README says the served VaultDB owns line 3.8. READMEs (IndexedDB template, Convex, Postgres,
    GraphQL) say so.
  - **The battery flag is gone**, not flipped: `describeVaultDB` no longer takes
    `comparesVaultKeyEpoch`, and line 3.8's three refusals run for every adapter (the todo went).
  - **`oneAtATime`** (`packages/safebyok/src/one-at-a-time.ts`, tests beside it): the refresh
    queue, out of `vault.ts`; `refresh = oneAtATime(() => readStorage())`. Thread 4's tests pass
    untouched.
  - **The Coach's two rulings on thread 4's review**, relayed mid-thread:
    1. *Key drops that are not hard locks.* → *Coach (2026-10-16):* yes: count `close()` and a
       key outlived by a refresh as hard locks; say in `lock()`'s doc which drops are not. Built: a
       `hardLocksSoFar` count, raised by every shut, a `close()` and an outlived key, which
       `openBox` compares; a read across a close refuses `vault_closed`, across an outlived key
       `vault_locked`. Four tests (read and use, each way). `lock()`, `read()`, `close()` docs
       and the README say it.
    2. *storage_unavailable for every device-store failure.* → *Coach (2026-10-16):* proceed,
       keep the kind; messages as fine-grained as reasonable. Built: `asCondition` takes the verb,
       and `DeviceTroubleSaid` names what failed and what to do for each of the seven verbs, with a
       closing line for a store that fails every time (blocked, full, private window). Tests per
       verb against the exported `deviceTroubleAsConditions`.
* **Decisions taken**:
  - **Remove the battery option rather than default it true**: an opt-out from a security line
    has no in-tree user left, and a host adapter that skips 3.8 should fail the suite. It is a
    `safebyok/testing` export change, so the changeset is minor.
  - **Postgres passes the expected epoch as its own parameter** (`$5`), not by reusing the
    lockbox's `vault_key_epoch` column, which the base class holds equal: the statement then reads
    as the contract does. `LockboxParamsFrom` is 7 and the comment says each slot.
  - **A separate hard-lock count**, not `shutsSoFar`: an `unlock()` refreshes for itself, and an
    outlived key raising `shutsSoFar` would make that unlock lose to its own refresh.
  - **`oneAtATime` begins its task inside an async wrapper**, so a task that throws before its
    first await rejects; without it, `running` was cleared before it was set and the queue spun
    forever (found by its test). One more microtask per run than thread 4's; every vault test
    stayed green.
  - **`eraseDamagedVault` now goes through `deviceTroubleAsConditions` too**: it threw the device
    store's raw error before; "every device-store failure" includes it. One thread-4 test changed
    from `rejects.toThrow('busy')` to `storage_unavailable` with that cause.
* **Deviations**:
  - **The README's hard-cap trigger changed.** Its `PERFORM ... FOR UPDATE` on the bundle row
    would deadlock two first writes into one vault, each already holding the row `FOR SHARE`
    (a lock upgrade), so it now takes `pg_advisory_xact_lock(hashtext('safebyok_lockboxes_capped'),
    hashtext(scope))`. Same verdicts: the count after the lock is a fresh statement. The changeset
    tells hosts who installed it to replace it.
  - The Postgres test "holds no lock" now says "locks nothing but its bundle, shared", and checks
    one `FOR SHARE` per lockbox write and none in an erase.
* **Discoveries**:
  - **PGlite cannot prove `FOR SHARE`** (one statement at a time). The real-Postgres race belongs
    in thread 11's `e2e/tests/postgres/races.test.ts`, which this branch does not have yet.
  - `vault_key_epoch` is 1 in every vault until `rotateVaultKey` exists, so no write a host makes
    today is refused by the new comparison: it is latent armour.
* **For the restack** (whoever stacks this onto 11 and 5b):
  - `e2e/tests/postgres/battery.test.ts` (thread 11) passes `comparesVaultKeyEpoch: false`:
    delete the line (excess-property error otherwise). Its `hard-cap.test.ts` comment "holds the
    trigger's lock on the bundle" now means the advisory lock; the waits are still `Lock` waits, so
    `untilStatementBlocked` sees them.
  - Add the race on a real Postgres: a bundle update to epoch 2 held open in a transaction; a
    lockbox write under epoch 1 blocks (`untilStatementBlocked`), then refuses `stale_write` once
    it commits; and the reverse, a held lockbox write making the bundle update wait.
  - **Thread 5b** deletes `safebyok-indexeddb/src/expectations.ts` for core's `Expectations`.
    Core's `lockboxMeetsExpectation` already compares the epoch (`vaultKeyMeetsExpectation`).
    Carry over the rows this thread added to `tests/expectations.test.ts` (a rotated bundle, a
    bundle row with no `vault_key_epoch`, an epoch stored as text, a write ahead of the bundle)
    into core's `Expectations` tests. Core's predicates parse with Zod where IndexedDB's read plain
    fields: same verdicts on these rows. 5b's G247 touches Convex's `updateBundle`; this thread
    touched only `updateBox`.
* **Rows**: **G065 closed** (code, every adapter; `notes/security.md`). **G138 closed** (no look
  before writing holds: storage alone refuses a stale vaultKey's write, atomically; the strawman's
  answer, now true; `notes/security.md`). Thread 4's Open Matters rows: **the refresh queue's
  library-first yes, closed** (module built, as ruled); **drops that are not hard locks, closed**;
  **storage_unavailable for every device-store failure, closed**.
* **Review**: `fixed`, nothing significant. The reviewer's `990da2c5`: an `eraseUnlock` failure
  says "try again", not "lock again" (`eraseDamagedVault` has no vault to lock). A `docs:` commit
  at filing: lockbox writes never wait for each other *on the bundle* (one boxlabel's writes still
  meet at its row; the hard-cap trigger makes inserts take turns).
* **Open matters**:
  - **`oneAtATime`'s `begin` duplicates `vault-db.ts`'s `soon`.** Rec: share one at 5b or 9.
  - **An `eraseUnlock` failing after a refresh outlives the key is never retried** (older than
    this thread). Rec: leave; an open refuses a remembered unlock at the wrong `unlock_epoch`.
  - **`FOR SHARE` on a real Postgres is unproven** until thread 11's race suite runs it. Rec: add
    the race at the restack (above).
  - **A device store that never opens** (storage blocked, a private window) is
    `storage_unavailable` like a passing failure, though retrying will not help. Rec: keep the kind
    (the Coach's grouping); the message now says what to check. A kind of its own only if a host
    asks to branch on it.
    - → *Coach (2026-10-16):* A kind of its own: cannot succeed vs might later (thread 17).
  - **The advisory-lock key** in the hard-cap trigger is `hashtext` of the scope, so two vaults
    may share a key and take turns needlessly; the two-int form keeps it apart from a host's own
    one-bigint advisory locks. Rec: as built; the recipe is unsupported anyway.
    - The hard-cap recipe: → *Coach (2026-10-16):* Delete it; a short agent prompt instead (thread 9).
