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

* *Thread 1:* the listing's snapshot is each present thing's `sparse`, the sparse form of
  **central**, so a box built from a dna shows there as its never-stored tombstone. **Ruled**
  (the Coach, 2026-10-30): the listing's snapshot is its present things' own snapshots, never a
  view of its own; every legitimate access path to a record agrees. Thread 3's fix (d).
* *The Coach (2026-10-30):* old *What a* / *What the* comments and the banned words are fixed as
  you go, throughout the model code a thread works in (plan, ground rule 2).
* *Thread 1:* the cache is handed a `cacheable` whose `central` is the full record when one was
  received, not its sparse form.
* *Thread 1:* `build(dna)` does not save to the cache today; thread 3's `settle(thing)` will, and
  the `save` assertions thread 1 left in `box-listing.test.ts` change with it.
* *Thread 1:* `box.sidecar` is null for a draft, since a draft is not full.
* *Thread 1 review; orchestrator's YOLO call, open to the Coach:* **a damaged record arrives as a
  tombstone, `am` 'd', in the kind's sparse form**, the adapter filling in the kind's constants
  (for a box `fmt`, `whisper_codec`, `whisper_schema_version`). A bare tombstone (scope,
  `vault_tok`, revision and times only) refuses `bad_record` at `sparseOf`. Tests that build a
  damaged answer, a `stale_write`'s `meta.box_stored` included, use
  `tombstoneBoxRecord(overrides, 'd')`, which builds exactly that form.

## Shared test world

`packages/safebyok/tests/test-helpers/models-world.ts` (thread 1, #370). The full API is the
heading *The test world* in `thread-1-models_world.md` on branch `20261030-models_world`. In
short:

* `const held = useModelsWorld()` at the top of a test file; `held.mw` is a fresh world for each
  test, disposed after. A `let mw` assigned in `beforeEach` fails lint
  (`unicorn/no-top-level-assignment-in-function`). Import it directly: it is not on the `TH`
  door, which ships as `safebyok/testing`. Add helpers at the file's end.
* `mw.world`, `mw.store`, `mw.cache`; `boxListingOf(mw, overrides?)`, horizon ten minutes,
  `onBadNews` into `mw.badnews`.
* One ordered call log, `mw.calls` (`ensureTimely`, `takeWorld`, `get`, `put` with `expected`
  and `ifPresent`, `del`, `watch`, `unwatch`, `load`, `save`); `mw.callsOf(verb)`,
  `mw.clearCalls()`.
* Defaults: `get` answers what is stored or null; `put` keeps and answers the record; `del`
  answers a tombstone one seq on. **Nothing compares `expected`**: a stale write is scripted.
* Scripting, one answer per call: `willGet`, `willPut`, `willDel`, `willLoad`, `willEnsureTimely`,
  `willSave`; answer makers `answerOf`, `refusalOf`, `staleWriteOf(scope, stored)`; seeding
  `seedStore`, `seedCache`; pushing `notify`, `notifyRaw`.
* Time: fake timers on by default; move time only by `mw.setNow(ms)` (clock alone) or
  `await mw.advance(ms)` (clock and timers together). Lock by `mw.setLockState`.
* Builders: `fullBoxRecord`, `sparseBoxRecord`, `tombstoneBoxRecord(overrides, 'x' | 'd')`,
  `boxscope(boxlabel)`, `T0`.
