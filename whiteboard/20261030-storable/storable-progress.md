# Sprint storable: progress

The orchestrator's curated record of what the threads have taught, newer than the plan wherever
the two disagree. Workers look things up here; the handoffs carry what each thread needs.

## Decisions

* *Orchestrator (2026-10-30):* thread 4 is split into 4a (fixes (a)-(c), hydrate and timeliness)
  and 4b (fixes (d)-(g), verbs and guards), 4b cut from 4a's tip.
* *Orchestrator:* thread 3's test *fetch of nothing stored for a thing held alive refuses
  `record_conflict`* moves to thread 2, which adds the kind; thread 4's *`isWatchable` is a plain
  get/set, true until set* moves to thread 3, which sets the default.
* *Orchestrator:* `trigger.ts` is `packages/safebyok/src/helpers/trigger.ts` (moved in 7483a7b3);
  the brief's `src/utils/trigger.ts` is stale.

## Discoveries

None yet.

## Shared test world

Thread 1 builds `packages/safebyok/tests/test-helpers/models-world.ts`; its API lands here once
filed.
