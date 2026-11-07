# Sprint devicedb_idb: progress

What the threads have taught, newer than the plan wherever they disagree. Kept by the
orchestrator; workers look things up here and write in their own thread files.

## Settled before the first thread

* *Orchestrator:* the vaultdb line is merged (main at 495cc5d6e). The VaultDB rewrite is the
  model for the DeviceDB's shape: a try/catch in each public verb's body, `do*` hooks one atomic
  step each, a battery on `safebyok/testing` that each store runs.
* *Orchestrator:* the core has no IndexedDB library today; `safebyok-indexeddb` uses `idb-keyval`
  with its own transaction helper in `packages/safebyok-indexeddb/src/shelf.ts` (`inOneStep`,
  `abortOf`, `workOrAbandon`, `troubleOf`).
* *Orchestrator:* the old device store is `packages/safebyok-old/src/idb.ts`, a reference for the
  old database name (`${dbName}:device_db`, store `records`) only. Never change it.
