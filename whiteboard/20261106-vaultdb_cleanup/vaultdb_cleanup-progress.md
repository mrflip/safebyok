# Sprint vaultdb_cleanup: progress

What the threads have taught, newer than the plan wherever they disagree. Kept by the
orchestrator; workers look things up here and write in their own thread files.

## The sprint doc

*Orchestrator:* https://claude.ai/artifact/LJYRKB5uG4bzR8VWBVti1j (doc 9c50a432-987f-4fd0-9fa9-0b3e23352d26).
Tabs: Open Matters (file 244f7e31-9504, body 497cd45c-5dfd, matters table m3dgc82559j.353,
bookmark rev 498), Cleanup (body f05b9de5-044d), Progress (body 28f63d17-9ac5, table
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

## Thread 1: vaultdb_plain (#555, in review)

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
