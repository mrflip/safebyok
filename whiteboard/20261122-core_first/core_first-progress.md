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

## End states, for the final report

*Orchestrator:* the Coach put end states out of bounds (2026-11-22, plan *Ground rules*). Collisions with them are
gathered here for the final report, never as open matters.

* The BankMinder's world (holding the main gate's wrapped bankKey) outlives the bank: goodbye, sweep and vacate leave
  it; thread 2 recorded G3's drift. Its rec: drop the world at vacate. (#844)
* A notice of a bank's new life, with no whole world behind it, lands nowhere until a world arrives; a wontfix row.
  (#844)
* #831's review left three findings at endings, S1 to S3 (react_targets burndown, *Out of bounds*). Known, not repaired.
