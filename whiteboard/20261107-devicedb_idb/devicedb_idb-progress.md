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

## Planning lessons

* *Orchestrator:* thread 4 (graphql_schema, L) outgrew one context: its first worker compacted
  twice before finishing milestone 1 (the core). Fresh workers, one milestone each, finished 2, 3
  and 4. An L thread with a core change plus a server plus a client is three threads; hand each
  milestone to its own worker from the start.
* *Orchestrator:* rulings arrived continuously mid-thread; SendMessage to a live worker carried
  them (threads 2 and 5) without a restart.
