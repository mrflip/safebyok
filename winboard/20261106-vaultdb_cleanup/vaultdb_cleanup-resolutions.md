# vaultdb_cleanup: resolutions

## 2026-11-06

### Ruled by the Coach

1. **The demo's vault store.** The demo runs on the old Bank, which cannot take a ported IndexedDB adapter. Rec: thread 3 moves the demo onto the old core's localVaultDB over localStorage until the demo moves to the new core.
   * Coach: "lgtm"
   * Raised: plan thread 3, 2026-11-06.
   * Went to: thread 3's gloss and handoff.

2. **A battery split out as its own thread.** Each port needs a battery for the new VaultDB and more of the core exported. Rec: thread 2 builds both, judged by what src/models needs, describeVaultDB a reference only.
   * Coach: "love it, yes"
   * Raised: plan thread 2, 2026-11-06.
   * Went to: thread 2 as planned.

3. **Coach note: -old packages.**
   * Coach: "if it's warranted to move old code into packages/safebyok-whatever-old and then write into packages/safebyok-whatever you have permission to do so -- that's an offer of your choice, not a request by me"
   * Raised: 2026-11-06.
   * Went to: the plan's ground rules; my call on Cleanup.

4. **The demo's vault store, revised.**
   * Coach, in chat: "it may be easier and better to make a safebyok-idb-old package"
   * Raised: 2026-11-06, on the demo ruling above (item 1).
   * Went to: plan thread 3: git mv the old adapter to a private safebyok-idb-old, the demo points at it, the new safebyok-indexeddb written fresh.

5. **A bug reads as a storage outage.** The method-wide catch turns any foreign throw into storage_unavailable. Rec: keep.
   * Coach: "Adapters are encouraged to catch and triage errors into VaultError subclasses, or to synthesize them based on what their query returns."
   * Raised: #555 thread 1, 2026-11-06.
   * Went to: the plan's ground rules for threads 2-6; the base's catch stays (Cleanup, my reading).

6. **A newer row format reads as damaged.** damaged_row naming fmt, not newer_format. Rec: keep.
   * Coach: (empty: took the Rec)
   * Raised: #555 thread 1, 2026-11-06.
   * Went to: kept as built.

7. **tidyGone stays without a caller.** Rec: keep.
   * Coach: "it's for hosts to call"
   * Raised: #555 thread 1, 2026-11-06.
   * Went to: kept; every port implements doTidyGone.

8. **Put acts stay without a reader.** Rec: keep.
   * Coach: (empty: took the Rec)
   * Raised: #555 thread 1, 2026-11-06.
   * Went to: kept as built.

9. **A gate move no longer re-adds a vault.** Rec: keep.
   * Coach: "yes please"
   * Raised: #555 thread 1, 2026-11-06.
   * Went to: kept as built.

### Calls left to the orchestrator

1. **Your offer of -old packages.**
   * Call: On your word in chat: the old indexeddb adapter moves to a private safebyok-idb-old, which the demo keeps using; the new one is written fresh. Postgres, GraphQL and Convex take no -old copy: only e2e uses them, and it moves to the new contract.
   * Lands in: Plan thread 3; thread 3's handoff.

2. **Foreign throws, after your triage ruling.**
   * Call: Each adapter catches its store's errors and turns them into VaultErrors (or synthesizes them from what its query returns); the base's method-wide catch stays as the backstop for whatever slips past. Say so if you meant the base to stop wrapping.
   * Lands in: Plan ground rules; threads 2-6.

3. **Battery fixtures share names with storage checkers.**
   * Call: No rename: adapter tests use namespace imports (TH., SX.), the repo's convention.
   * Lands in: Port handoffs.

4. **What a failing store must refuse; watch teardown; validating the battery's opts.**
   * Call: The battery's failure case requires storage_unavailable; every watch is closed when its case ends, unwatch safe twice; describeVaultDBBattery parses its opts.
   * Lands in: #558, a rework before it files.

5. **The new IndexedDB adapter has no inspector, and no box cap.**
   * Call: Leave both out: the demo keeps the old inspector through safebyok-idb-old until it moves to the new core, and IndexedDB sets no cap, so two battery cases skip.
   * Lands in: #560 as built.

6. **Porting Postgres leaves GraphQL red.**
   * Call: GraphQL's port joins #561 rather than a PR of its own, so no PR in the line is red alone: thread 5 builds on a branch from thread 4, rebases onto its reviewed tip, gets its own review, and #561 files whole.
   * Lands in: #561.

7. **The route recipe and the user check leave the Postgres package.**
   * Call: Thread 5 states the recipe fresh and keeps the user check at the GraphQL server, tested.
   * Lands in: Thread 5's handoff.

8. **IndexedDB's watch channel: no guard, no unref.**
   * Call: Leave both under the plain-BroadcastChannel decision; add a typeof guard and an unref check if a Node host turns up.
   * Lands in: #560 as built.

9. **GraphQL's smaller calls.**
   * Call: Kept as built: an unlimited byte capacity crosses as MAX_SAFE_INTEGER (as SX.capacity gives); foreign GraphQL errors and network failures become storage_unavailable (your triage ruling); the battery's test client signs each operation in as the user it names, so the gate stays on; the refusal's cause rides unenumerable for server logs only.
   * Lands in: #561 as built.

10. **Convex's smaller calls.**
    * Call: Kept as built: the old Bank-flow tests are dropped until a Bank runs on the new core; the component's record validators are typed as the core's records (one cast left, to fix the declaration build); a fresh README; FakeDeployment.arrange, a new test helper on safebyok-convex/testing; the changeset at minor, as PROCESS.md says before 1.0.
    * Lands in: #559 as built.

11. **GraphQL's subscription buffer is unbounded.**
    * Call: Leave it: notices are hints and hold ciphertext only, and simple ranks above failsafe.
    * Lands in: #561 as built.
