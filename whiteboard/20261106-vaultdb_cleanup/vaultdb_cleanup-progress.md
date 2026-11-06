# Sprint vaultdb_cleanup: progress

What the threads have taught, newer than the plan wherever they disagree. Kept by the
orchestrator; workers look things up here and write in their own thread files.

## Settled before the first thread

* *Orchestrator:* `vault-db-new.ts` and `memory-vault-db.ts` are on `origin/main` (newer than
  some local branches): cut from `origin/main`, never from a local checkout.
* *Orchestrator:* every old adapter's tests run `describeVaultDB` from `safebyok-old/testing`
  (`packages/safebyok-old/tests/test-helpers/vault-db-conformance.ts`): the shape thread 2's
  battery replaces. Read it for coverage ideas, not code.
* *Orchestrator:* consumers of the old adapters: `demos/safebyok-demo-react/src/lib/stores.ts`
  and `persist-storage.ts` (indexeddb), `e2e/tests/postgres/*`, `e2e/tests/convex/*`.

## Thread 1: vaultdb_plain

*(underway)*
