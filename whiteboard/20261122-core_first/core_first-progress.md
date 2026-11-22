# core_first: what the threads have taught

Curated by the orchestrator; newer than the plan wherever they disagree. Each worker keeps its own
`thread-<N>-<label>.md` beside this file, on its own branch.

## Before the first thread

* Main's core (`packages/safebyok/src`) has one minder, `ThingMinder` (686 lines), caching bank, gate and boxes in a
  client of its own; a `Device` made for one user and banklabel (`models/device.ts`); no deviceDB and no persistence.
* The workshop's core work sits on its React line, not on main: #827 (minder house), #831 (minder client). Thread 1
  carries #827 over; #831 is an idea for thread 4.
* Another session's ready PRs touch the core: #828 (`lifetok` on the bank's Thing and stamp), #830 (the lease and the
  wayin take a Thing's field names), #829 (`safebyok-idb-lean`: `IdbVaultDB`, `IdbMinderBridge`). They will merge under
  this sprint; `scripts/file-thread` rebases onto main as they do.
