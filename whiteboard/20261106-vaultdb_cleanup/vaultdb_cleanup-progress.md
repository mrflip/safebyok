# Sprint vaultdb_cleanup: progress

What the threads have taught, newer than the plan wherever they disagree. Kept by the
orchestrator; workers look things up here and write in their own thread files.

## The sprint doc

*Orchestrator:* https://claude.ai/artifact/LJYRKB5uG4bzR8VWBVti1j (doc 9c50a432-987f-4fd0-9fa9-0b3e23352d26).
Tabs: Open Matters (file 244f7e31-9504, body 497cd45c-5dfd, matters table m3dgc82559j.353,
bookmark rev 2), Cleanup (body f05b9de5-044d), Progress (body 28f63d17-9ac5, table
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

## Thread 1: vaultdb_plain

*(underway)*
