# Sprint vaultdb_cleanup: progress

What the threads have taught, newer than the plan wherever they disagree. Kept by the
orchestrator; workers look things up here and write in their own thread files.

## The sprint doc

*Orchestrator:* https://claude.ai/artifact/LJYRKB5uG4bzR8VWBVti1j (doc 9c50a432-987f-4fd0-9fa9-0b3e23352d26).
Tabs: Open Matters (file 244f7e31-9504, body 497cd45c-5dfd, matters table m3dgc82559j.353,
bookmark rev 504), Cleanup (body f05b9de5-044d), Progress (body 28f63d17-9ac5, table
m3dgc82559j.151), Resolved (body 4f88e807-c291). State enum 341239e5-518c.

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

* **Thread 6** (#559, draft): the first worker compacted twice and stopped with the component
  rewritten (three tables; each put/del one mutation following memory-vault-db.ts; tallies per
  life with hard limits so one delVault tombstones a life in one transaction) and core throwers
  added (`storageFailed(call, thrown)` = `storage_unavailable` naming the call and the error's
  name, no cause; `identityRevoked()`; `Checker, Checkers, objCheck` on the storage door). A
  second worker continues from its thread file. Its `gh pr ready` was refused by the auto-mode
  classifier; the orchestrator does not run a refused action for an agent.
* Core additions collide across siblings: each port adds lines to `safebyok/storage`'s index
  (all three add `Checker, Checkers, objCheck`). Resolved at the restack, one of each.
* **Planning lesson, again:** every thread so far has compacted; an L port does not reach its
  client in one context. Thread 5 (graphql) gets the continue-on-blocked pattern from the start:
  milestones named in its handoff, stop at two compactions.
