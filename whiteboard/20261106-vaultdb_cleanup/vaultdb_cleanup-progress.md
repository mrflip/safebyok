# Sprint vaultdb_cleanup: progress

What the threads have taught, newer than the plan wherever they disagree. Kept by the
orchestrator; workers look things up here and write in their own thread files.

## The sprint doc

*Orchestrator:* https://claude.ai/artifact/LJYRKB5uG4bzR8VWBVti1j (doc 9c50a432-987f-4fd0-9fa9-0b3e23352d26).
Tabs: Open Matters (file 244f7e31-9504, body 497cd45c-5dfd, bookmark rev 510; matters table m3dgc82559j.5596), Cleanup (body f05b9de5-044d), Progress (body 28f63d17-9ac5, table
m3dgc82559j.151), Resolved (body 4f88e807-c291). State enum 341239e5-518c. Append a matter row: `insert` side `end` on the table id, `as: blocks`, a
row of three cells, the chip `{type: dropdown, attrs: {enum, index: 0}}` (a markdown insert is refused).

## Settled before the first thread

* *Orchestrator:* `vault-db-new.ts` and `memory-vault-db.ts` are on `origin/main` (newer than
  some local branches): cut from `origin/main`, never from a local checkout.
* *Orchestrator:* every old adapter's tests run `describeVaultDB` from `safebyok-old/testing`
  (`packages/safebyok-old/tests/test-helpers/vault-db-conformance.ts`): the shape thread 2's
  battery replaces. Read it for coverage ideas, not code. **The Coach (mid-sprint):** it is no
  authority on how the new VaultDB works, and serves the old code base; what `src/models` needs,
  and readability, decide the contract. Old adapters' behaviour is no authority either.
* *Orchestrator:* consumers of the old adapters: `demos/safebyok-demo-react/src/lib/stores.ts`
  and `persist-storage.ts` (indexeddb), `e2e/tests/postgres/*`, `e2e/tests/convex/*`.

## Thread 1: vaultdb_plain (#555, filed at eb6569b17 after a rebase over #548, #549)

* The `do*` contract: `doPutVault(record, PutOptsGiven)`, `doPutBox(record, PutOptsGiven)`,
  `doDelVault(tombstone, DelOpts)`, `doDelBox(tombstone, DelOpts)`, each one atomic step
  returning a `Landing` (`BoxLanding` for box calls, with the vault row read in the same step).
  `PutTerms` is gone.
* Adapters throw `storageUnavailable`; `storageError`, `recordPreparedWrong`, `damagedRecord`,
  `newerFormat` are gone from the throwers.
* Rows are classified by `foundVaultRow` / `foundBoxRow` (shapes-storage.ts, exported), with
  `PutOptsGiven`.
* Tests call only public verbs and reach rows only through `_cheat_rowsOf(vaultDB).vaultrows()`
  and `.boxrows(tok?, scope?)` in `tests/test-helpers/storage-world.ts`: the seam thread 2's
  battery asks each adapter to supply.
* Refusals moved: single-row damage, a later `fmt` included, is `damaged_row` with
  `meta.fieldnames`; a bad record handed to a verb is `bad_option`; gate params are strict
  (`bad_option`), `gate_issue` only a `registered_at` mismatch; answers carry no `meta`, the verb
  name stays on `err.meta.call`. The method-wide catch turns any foreign throw into
  `storage_unavailable`; the Coach: adapters triage their own store's errors, the base's catch
  is the backstop. All five of its open matters ruled keep.
* Planning lesson: one compaction at ~157k just before the first justify, for a 12-file M thread.
  The L ports (postgres, graphql, convex) should be handed tight handoffs.

## Thread 2: vaultdb_battery (#558, filed at edbceeae2)

**For every port (threads 3, 4, 6):**
* Run `TH.describeVaultDBBattery('<Store>', { makeVaultDB, _cheat_rowsOf })` from
  `safebyok/testing`. `_cheat_rowsOf(vaultDB)` answers a `VaultDBRowCheats`: `plantVaultRow`,
  `plantBoxRow`, `vaultRowOf`, `boxRowsOf` (a Map snapshot). Optional: `makeTwin` (a second client
  over the same rows: give it, so the races are real), `makeCappedVaultDB(maxBoxes)`,
  `_cheat_failNextCall`, `watches: false`. A case needing a missing hook is skipped. Hooks may
  be async; watch cases wait with `vi.waitFor`. No teardown hook: close what your factory made
  in your own `afterEach` (say so if that proves awkward: an open question to the orchestrator).
* Import the contract from the new entry `safebyok/storage`: VaultDB (and DeviceDB) with their
  answer and do* types, the memory stores, every storage shape, checker and row helper, the
  lease shapes, the throwers with VaultError and outcomeOf. Fixtures (scopes, wayins, `vaultAt`,
  `boxAt`, tombstone builders) from `safebyok/testing`.
* Adapter tests import `safebyok/testing` as `TH` and `safebyok/storage` as `SX`: six names
  (`bankScope`, `vaultScope`, `boxscope`, `passphraseWayin`, `passkeyWayin`, `boxTombstoneOf`) are
  fixtures at one door and checkers at the other.
* The battery's failure case requires `storage_unavailable` from `_cheat_failNextCall`; every
  watch a case opens is closed at its end, so `unwatch` must be safe to call twice.
* A new package entry needs its `typesVersions` line written by hand (tsdown does not; attw
  checks it).
* Files to read for the shape: `packages/safebyok/src/storage/index.ts`,
  `packages/safebyok/tests/test-helpers/vault-db-battery.ts`, and the battery run over the memory
  store, `packages/safebyok/tests/storage/memory-vault-db.test.ts`.

**Planning lesson:** threads 1 and 2 (M) each compacted near 160k, thread 2 twice in 12
minutes. The L ports will too: each handoff says commit at every milestone, keep the thread file
current enough for a fresh worker to continue, and leave e2e for last.

## Threads 3, 4, 6: the ports

*(cut from edbceeae2, building side by side)*

* **Thread 6** (#559, ready at ee7f63d13, in `high` review; two workers, four compactions). The second
  worker finished the client, server wrapper, testing, battery and e2e; fixed a declaration-build
  failure (zod's `$brand`) by typing the component's record validators as the core's records (one
  `as unknown as` left); exported `Sidecar`, `WhisperJson`; README fresh; changeset at minor. The first worker compacted twice and stopped with the component
  rewritten (three tables; each put/del one mutation following memory-vault-db.ts; tallies per
  life with hard limits so one delVault tombstones a life in one transaction) and core throwers
  added (`storageFailed(call, thrown)` = `storage_unavailable` naming the call and the error's
  name, no cause; `identityRevoked()`; `Checker, Checkers, objCheck` on the storage door). A
  second worker continues from its thread file. Its `gh pr ready` was refused by the auto-mode
  classifier; the orchestrator does not run a refused action for an agent.
* **Thread 3** (#560, filed at 029f9e82d): old adapter moved whole to private `safebyok-idb-old` (the
  demo's store and inspector); `safebyok-indexeddb` new: `IdbVaultDB`, `idbVaultDB(opts)`,
  `IdbVaultDBOpts` (`dbName`, `maxRecordBytes`); each do* one transaction; watch over
  BroadcastChannel after commit; triage in `src/shelf.ts` `troubleOf` (quota → `vault_full`,
  closed/aborted/withheld/absent → `storage_unavailable`). Core: `storageFull(cause)` and the
  validator makers on the storage door (513c644fe). Size line idbVaultDB 2.6 → 2.9 kB. The root
  `size` script builds safebyok too. `isPutAllowed` copied from memory-vault-db (export it after
  the ports). No inspector, no box cap (Cleanup).
* **Thread 4** (#561, filed at fb6d281d3 with thread 5; two compactions): `PostgresVaultDB({ client, listen?, maxBoxes?,
  maxRecordBytes? })`, client `{ query, transaction }` (PGlite as is; `pgClientOf(pool)` for pg),
  `listen` on `VaultChangeChannel`; `VaultTablesSql`; two jsonb tables, the vault row locked per
  write, notices by pg_notify (over 7999 bytes: keys only, re-read). The user_id gate and route
  recipe dropped (the route layer's: thread 5). e2e races rewritten, foreign-key test deleted.
  **graphql is red on this branch**: *Orchestrator, YOLO:* thread 5 builds on a branch from
  022d690f2 with no PR of its own, rebases onto #561's reviewed tip, gets a review over its own
  range, then 20261106-port_postgres fast-forwards to it and #561 files whole.
* **Thread 5** (filed in #561 at fb6d281d3 with thread 4; reviewed `high`, fixed; one compaction): rebased on b72a514b6; justify green everywhere. Core: `VaultDB.relay` getter and
  `VaultDBRelay` on `safebyok/storage` (60e58e9fa), each relay call checked as its verb, then the
  do* hook: the route a server adapter takes (thread 6 could use it after the restack). Server:
  one operation per do*, gate = user_id equality with `userIdOf(context)`, refusal kind alone on
  the wire, cause unenumerable. Client: `GraphQLVaultDB` over urql; rows as one `SafebyokJson`
  scalar. README written fresh (route recipe). After review: fast-forward
  20261106-port_postgres to it, file-thread, #561 files whole.
* Core additions collide across siblings: each port adds lines to `safebyok/storage`'s index
  (all three add `Checker, Checkers, objCheck`). Resolved at the restack, one of each.
* **Planning lesson, again:** every thread so far has compacted; an L port does not reach its
  client in one context. Thread 5 (graphql) gets the continue-on-blocked pattern from the start:
  milestones named in its handoff, stop at two compactions.
