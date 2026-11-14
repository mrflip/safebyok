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

* *Thread 5 (#376):* `LOCKED` is `Symbol.for('LOCKED')`; a locked box's `sidecar`, and its
  snapshot's, is one frozen `{ [LOCKED]: true }` (`LockedSidecar`, exported from `box.ts`);
  `Box.sameSnapshot` compares the bag by identity, since `stableJsonify` drops symbol keys: any
  later symbol-keyed snapshot field needs the same. The nine own keys: the four scope parts,
  `registered_at`, `vault_tok`, `revision_tok`, `revision_seq`, `written_at`.
* *Thread 7 (#377):* `MSX.boxDna` (a `Checker`, `bad_option`) at `BoxListing.build`'s door;
  `hasRevision` exported from `listing.ts` tells a record from a dna; `MSX.Dna` allows
  `undefined` on each record prop; `BoxListing.draftOf` lays the factory's props over the dna's.

* *The Coach's rulings of 2026-10-30, second batch* (verbatim in the sprint doc's *Resolved*):
  - **Throwing** (on thread 3): "Throwing means 'We fundamentally cannot give you what you asked
    for, and need to wreck everything in consequence'. If you can give them what they asked for,
    no throw. If not, throw." Reporting to the customer (`onBadNews`) is good.
  - **One pipeline** (on `hello`): "everything should go through a common scheme: hello, send,
    anything -- buildOrReceive, so that there's no way for anything to be built more than once."
    Survey for other places the rule is broken.
  - **Timeliness:** "If I hold version 20 (whole) and see that we're still on version 20 (any), I
    am fresh again. Same for holding version 20 sparse with a staged (making combined whole)". So
    success is noted on a received record not older when the record in hand is whole; an older
    record notes nothing; `hydrate` forces a fetch only when the record in hand is not whole.
  - **`vault_tok` and `registered_at`:** `assign` sets them only when the current record is a
    tombstone (true at birth and death); reconcile responds to a different `vault_tok` arriving.
    "Do whatever has the least logic" on `registered_at` during an in-flight `del`.
  - **`edit` and a moved central:** `edit` refuses `stale_write` when central's tok is not the one
    it minted against (took the Rec).
  - **Exposed whisper:** stays on the instance while locked and unlocked ("calling expose
    indicates a different risk tolerance"); `expose` was on the design-not-implement list.
  - **Background refresh refusals** go to `onBadNews` ("yes").
  - **The cache:** "it's a cache, it's fine for it to get updated multiple times or not at all";
    listeners before the save are accepted. Edits not cached: a TODO.
  - **`ifPresent`:** removed (thread 8), then back as `'replace'`, inert (thread 11; see the Coach's ruling on what it means). **`same | full | ouch`:** fill. **`del` answered `same`:**
    drops the staged tombstone. **`record_conflict`:** a condition, worth one retry.
    **`cacheable`:** protected if only the listing needs it. **`bad_option`** for every dna fault.
  - Left as they are: one listing horizon of Infinity fetching once; three `ensureTimely` calls
    ("we will address it, but outside and/or later"); a damaged record counting as a refresh
    (superseded by the timeliness rule); nobody settling boxes on lock (the vault's thread).
* *Orchestrator (2026-10-30):* #370 and #371 force-pushed onto #374 with the Coach's permission;
  the rest of the line restacks as main → #368 → #374 → 1 → 4a → 2 → 5 → 7 → 4b → 3.
* *Orchestrator (2026-10-30, YOLO call, a Coach row):* a `send` whose vault locks between `edit`
  and `put` puts the staged record it holds (`cacheable.staged`), not the box: thread 5's locked
  `sidecar` getter returns the LOCKED bag, and `put` parsing the box's getters refused
  `bad_record`. Lands in #375 at its rebase. #373, #376 and #377 are pushed on the line (tips
  ff949221, c58f468e, 9f3376f7; justify green); thread 5's `boxOf` became `builtBoxOf`. #372 is
  rebased once, onto 4b's reworked tip, by thread 3's rework worker.

* *The Coach's rulings of 2026-10-30, third batch* (verbatim in *Resolved*): a dna carrying
  `revision_seq` is refused; `registered_at` takes "needs no logic" (and the Coach is looking into
  its constraints); a record under another `vault_tok` throws `unexpected_error` (thread 9);
  `build(dna)` over a held scope refuses; the timer reschedules after any completed launch
  (thread 10). Every tombstone is whole, the never-stored shim at revision -1 included.
* *The Coach's conception of making a record, to revisit when the Coach is back:* "regular data
  inserted over a tombstone at rev -1 that is never sent, followed by an immediate dispatch at max
  fresh window. Does not rely on detecting that a record is new, or indicating that a record is
  new; does not need a special validator, does not need a special name." Today `build(dna)`,
  `boxDna` and `hasRevision` do this with a dna validator; build nothing more on them.

* *The Coach's rulings of 2026-10-30, fourth batch* (verbatim in *Resolved*): `ifPresent` comes
  back as an optional flag taking only `'replace'` ("We might actually need it for vault, later"),
  the spec noting the other flags wait on a need and a scenario table (thread 11); the sidecar is
  visible locked or unlocked (thread 12); the whisper becomes an object, `.val`, for the models'
  box only (thread 13). **Making a box seals it** ("you have to seal (via some
  unspecified-as-yet-by-me step) as part of making a new box. So the box is never sparse"): the
  step is the Coach's to specify; until then `#holdsWhole`'s union stays (a TODO, thread 10).
  The whisper's get/set "should be cutting off access to the private variable when locked": the
  Coach's to look at; thread 9's setter (null and `LOCKED` pass while locked) stays, documented.
* *The Coach's rulings of 2026-10-30, fifth batch* (verbatim in *Resolved*): **build seals what
  it stages**, through a stub seal of placeholders, so a box is full from birth and can always be
  made full by refreshing (thread 14; it supersedes the "making a record" hands-off for `build`
  and `boxDna`, and retires `#holdsWhole`'s union); a draft meeting another `vault_tok` throws
  ("practically impossible once we have vault"); who reads `cacheable`: only the listing's
  `settle` (a row asks whether to make it a push and `#`-private).
* *The Coach's rulings of 2026-10-30, sixth batch* (verbatim in *Resolved*): **a whisper and a
  sidecar on every update** ("greatly simplifying"; thread 15): nothing is carried over from the
  record in hand; `cacheable` private, pushed by the storable's settle (thread 12); the double
  edge (an edit carried past damage, dropped on nothing stored) accepted if documented and tested
  (thread 12). Force-push permission renewed ("You have permissions to force push as needed").
* *The Coach (2026-10-30), on what `'replace'` means* (verbatim in *Resolved*): **every put is the
  versioned replace (compare-and-swap)**; storage never renumbers or patches a record;
  `ifPresent: 'replace'` names that default and changes nothing; `'fetch'` (not implemented) would
  CAS-put over no row or a tombstone at N - 1 and otherwise answer what is stored as a success. The
  spec's `ifPresent` entry is the table. A revision-0 put over a stored tombstone is `stale_write`.
  The brief's thread 8 text (its `'fail'` is this `'replace'`; its `'replace'`, an overwrite, does
  not exist) is superseded.
* *The Coach (2026-10-30), the store's versioned replace* (verbatim in *Resolved*): storage
  enforces that each revision is the prior's seq + 1 under the prior tok; the device sends the
  prior tok only, never the prior seq; no row requires prior tok null **and** seq 0, either
  without the other inconsistent ("I hate using null as a sentinel"). `'fetch'` "only makes sense
  against an assumption it doesn't exist", hence not implemented. Thread 16.
* *Thread 16 (#388), the versioned replace:* `Store.put(record, priorTok)` and
  `Store.del(scope, priorTok)`; storage judges the pairing (prior tok null with seq 0, a tok with
  seq >= 1), then no row, then a row under another tok (`stale_write` carrying it; a tombstone is a
  row), then seq + 1 under the prior tok; the inconsistent cases refuse `bad_record` (the Coach:
  "sound's good"). **Renamed:** `Storable.expectedRevision()` is `priorTok()`,
  `Listing.expectedRevisionOf` is `priorTokOf`, the fake's `callsOf('put').expected` is
  `.priorTok`. **The fake enforces the contract:** a test must seed (`seedStore`) any record it
  puts or deletes over, and a put over a seeded record carries that record's tok at its seq + 1.
  A `del` with null over no row lays a tombstone at revision 0. The device checks the pairing
  only (the Coach: "leave it, storage owns the + 1 rule").
* *Thread 17 (#389):* `cacheable` is private. `Storable#settle` pushes a copy through
  `this.listing[MSX.KeepCopy](copy)`; the listing keeps the last copy per scope and saves it on
  each delivery and build (never an edit or a revive). Every `adopt` is followed by `settle`.
  Tests read central and staged through `keptOf(held.mw, box)`; `lastSaveOf(mw, box)` gives the
  fake cache's last save.
* *The Coach (2026-10-31):* a device behind a rollback (storage older than central, or empty
  under a live central) "is an impossible situation unless it's by deliberate user action i.e. a
  backup": throw (thread 19). Every entrypoint validates its arguments, `edit` and `send`
  duckish (thread 18).
* *Orchestrator (2026-10-30), a planning lesson:* thread 9 (ten rulings, medium) compacted twice,
  once before its first justify and once after. Ten small items in one thread is one context's
  worth; threads 11-13 are one ruling each.
  Thread 10 (eight items, sonnet) ran with a *keep your context lean* paragraph in its handoff
  (search before reading; read by line range; one test file while building, justify once; `tail`
  long output; never read `storable.test.ts` whole) and did not compact. Every handoff carries it.

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
