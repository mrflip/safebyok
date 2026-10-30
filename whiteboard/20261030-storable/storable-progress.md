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

* *The Coach (2026-10-30), a direction for every thread:* the models' contract runs ahead of
  today's VaultDB. Where it asks storage for more than VaultDB returns, workers supply the extra
  fields in the fakes and tests; the adapters are a later match-up. The damaged-tombstone ruling
  is kept on that ground.
* *The Coach (2026-10-30):* bad-news handling is unspecified later work (plan, *For the Coach*).
  Build nothing for it; note where bad news cannot reach anyone.

* *Orchestrator (2026-10-30), at the Coach's request via session byok-ed:* the line stacks on
  **#374** (`20261030-vault_model`, on #368): its 2f7337f3 makes `vault_tok` follow the record in
  hand (the tattoo keeps the scope and `registered_at`), and it adds `models/vault.ts`,
  `vault-listing.ts` and a vault section in `models-shapes.ts`, untested. #370 and #371 are
  rebased onto it **locally only** (branches `20261030-models_world`, `20261030-timeliness`; copies
  `restacked/...`): the force-push was refused, a row for the Coach. Origin's #370/#371 still sit
  on #368. Thread 4b builds on the local restack. Threads 2, 3 move at the final restack.
* *The Coach (2026-10-30), on thread 3's bad-news inventory:* "do write stuff that's useful and
  consistent with the plan. Perhaps you could run the build() branch of deliver in a method with
  a try/catch loop that syndicateds bad news": thread 3's rework, item 4.
* *The Coach (2026-10-30), on "alive":* "Don't redefine the constants. If a different policy
  makes more sense, implement that and put a big honking note down": thread 2's rework makes
  same-revision damage skip and a deletion over held damage read gone, in the table's rows.
* *The Coach (2026-10-30), on a box stuck on `record_conflict`:* no automatic way out ("we don't
  want something to cause infinite refresh. The real way out is to tell the customer").
* *Session byok-ed's scenarios.md* (in #374): P1 and P2 were already fixed in #372. **P3:** `send`
  hydrates first, so a draft's first send adopts a stored box and `ifPresent: 'fail'` never fires;
  a TOP row for the Coach, to settle before thread 8.

* *Thread 4b (#375, on the local restack):* `send` is `edit` then `put`; `demandReadyToDel` is
  `demandUnlocked`; `demandFull` stays (the box's unseal guard and `#unseal` call it);
  `registered_at` follows the record in hand (the tattoo keeps the scope alone, with #374);
  `#minted` memoizes the next revision until `send` or `del`; the box's unseal and seal guard
  pairs exist. Test helper `fakeSealBoxListingOf(mw, overrides, duringMakeStaged)` at the end of
  `models-world.ts` fakes the seal and can lock the vault mid-`makeStaged`. Tests read central and
  staged through `box.cacheable`. Its `tests/loosened/loosened.test.ts` meets #373's at the
  restack (add/add: keep one import block and both sets of describes). Four open matters (a
  record under another `vault_tok`; the exposed whisper across a lock; a refused background
  refresh; a `del` answered `same`).

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

* *Thread 4a (#371):* a record is **whole** when full or a tombstone (`isWholeRecord`, protected,
  beside `classifyRecordShape`); a damaged tombstone now notes success too (an open matter).
  `hydrate` passes `isWholeRecord(central) ? opts.maxMillisSinceRefresh : 0`.
  `isTimelyWithin(Infinity)` is true. A per-call `maxMillisSinceRefresh: Infinity` reaches
  `hydrate` through the `ensureReadyTo...` guards and fetches nothing, a draft's included; a
  *listing* horizon of Infinity still fetches once on a thing never fetched, since the trigger
  is born due (an open matter; `it.todo`). Under Infinity a `hydrate` during a fetch resolves at
  once rather than joining it.
* *Thread 4a:* a fetching `hydrate` calls the world's `ensureTimely` three times (`hydrate`, the
  launched `Storable.fetch` with `{}`, `listing.fetch`); tests assert only that the world comes
  first. An open matter; no thread changes it.
* *Thread 4a:* the trigger had no tests; `tests/helpers/trigger.test.ts` is new. 4a created
  `tests/models/storable.test.ts` and `tests/models/box.test.ts`, tops of imports and
  `useModelsWorld` only: a thread beside it creating the same file meets an add/add conflict in
  the imports at restack.

* *Thread 3 (#372):* `fetch` defaults to `ifAbsent: 'fail'`; a caller that wants null passes
  `{ ifAbsent: 'nil' }` (the trigger's launch does). `put`, `del` and notices judge no
  `ifAbsent`. The listing's `settle(thing?)` saves `thing.cacheable`, then remakes the snapshot,
  even when the save refuses. The listing's snapshot is `readonly SnapshotT[]`, the present
  things' own `getSnapshot()`: thread 5 tests the box's snapshot knowing the listing shows it.
  `isWatchable` defaults true.
* *Thread 3:* `hello` replaces a thing already held under a cached scope, so tests call `hello`
  first and build after (in review as a finding against one durable instance per scope).
* *Thread 3:* seven places bad news reaches no one are listed in its thread file; the inventory
  for the Coach's later design. Whether the trigger's launched `tryFetch` refusal reaches anyone
  was not followed: thread 4b follows it, as it works in the verbs the trigger launches.
* *Thread 2 (#373):* `record_conflict` is a condition kind, thrown by `cmpRevisions` and the
  one-revision-two-fates rows; `corrupt_record` stays for adapter answers in shapes the protocol
  does not allow. Thread 2 created `tests/models/listing.test.ts` (beside thread 3's) and
  `tests/loosened/loosened.test.ts`: append describes at their ends. Its thread file's section
  *Rows unreachable or differing from the table* is thread 6's source; four of its findings are
  open matters (what "alive" means; `same | full | ouch` has no row; an older record resets the
  refresh clock; a box held alive with nothing stored is stuck on `record_conflict`).
* *Orchestrator:* a PR's base is `main`, its first line "Stacked on #N" (`gh pr create --base
  main`); #371 and #372 were filed against #370's branch and moved.

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
  `await mw.advance(ms)` (clock and timers together). `setNow` past a timer's due time leaves it
  armed and unfired: to test "no timer", start from a draft or let it fire with `advance`
  (thread 4a). Lock by `mw.setLockState`.
* Builders: `fullBoxRecord`, `sparseBoxRecord`, `tombstoneBoxRecord(overrides, 'x' | 'd')`,
  `boxscope(boxlabel)`, `T0`.
