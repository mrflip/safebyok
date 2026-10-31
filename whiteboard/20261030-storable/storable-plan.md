# Sprint storable: box fills its contract

* **Date:** 2026-10-30. **Issued by:** the Coach (flip), from
  `whiteboard/20261028-storable_base/sprint-box-contract.md`.
* **Mode:** YOLO.
* **Levels (defaults):** review `medium`; worker and reviewer `opus` at their agents' own effort;
  style pass `sonnet` (`style-reviewer`'s pin). Thread levels below where they differ.
* **At once:** 3 threads.
* **Base:** every thread stacks on #368 (`20261030-storable_base`, draft), which holds
  `src/models/` and the spec. Thread 1 is cut from `origin/20261030-storable_base`.
* **Sprint doc:** https://claude.ai/artifact/Hup5kM2KFxxbXHDcR76wKB
* **Status:** main has merged through #390; thread 23 (#406) filing, on #405; then 25 (life toks), 24, 19, 20, then 6.

## Read first

* `CLAUDE.md`, then `whiteboard/20261028-storable_base/sprint-box-contract.md` whole: the Coach's
  brief. Its *Read first*, *Ground rules* 1-8, *The absent contract*, *Where the spec and the code
  disagree* and *For the Coach* bind every thread. One correction: its `src/utils/trigger.ts` is
  `packages/safebyok/src/helpers/trigger.ts` since 7483a7b3.
* `whiteboard/20261030-storable/storable-progress.md`: what earlier threads decided and found.

## Ground rules

Particular to this sprint, beside the brief's eight:

1. **The models and the brief over the old code.** This sprint is a large departure from what
   `src/box.ts`, `src/vault.ts` and `src/shapes/` do. Where the old implementation and the models
   disagree, the models' code and the brief are the design; the old code is history. Nothing is
   ported from it, and no test imports it (brief, ground rule 5).
2. **Words.** In code, comments, doc blocks, thread files and PRs:
   * never `standing` or `stands` (temporary? estimate? upright?); say what is meant: *kept*,
     *in force*, *unchanged*, *remains*.
   * never `raise` (fail? increment?): *throw*, *refuse*, *bump*, *increase*.
   * name the operation (`get`, `find`, `fetch`, `put`, `del`, `hydrate`, `receive`) rather than
     `read` or `write`, which mean only the blanket category (CLAUDE.md, *Name the operation*).
   * no comment or doc block that opens *What the* or *What a* (`What a foo returns`, `What the
     blerg sees when created`). Concise and specific: `Return type of foo's X, Y or Z
     operations`, `DNA for creating a blerg`.
   * **Fix as you go** (the Coach, 2026-10-30: "there's a lot of scratch paper write-rewrites"):
     a thread rewrites any such comment, doc block or banner, and any of the words above, in the
     model code it works in, not only on the lines its change touches. A comment rewrite only;
     behaviour and names stay.
3. **Shared test files.** Threads 2, 3, 4a, 5 and 7 run side by side and add to the same files.
   Each thread puts its cases in top-level `describe`s of its own, appended at the end of the file,
   and edits no describe another thread wrote; additions to `tests/test-helpers/models-world.ts`
   go at its end too, without reshaping what is there. A restack then only keeps both sides.
4. **The loosened file** `packages/safebyok/tests/loosened/loosened.test.ts`: the first thread to
   need it creates it; every thread appends its describes at the end (brief, ground rule 2).
5. **Thread files** are `whiteboard/20261030-storable/thread-<N>-<label>.md` on the thread's own
   branch. Spec-against-code findings (brief, ground rule 4) go there and in the PR's open
   questions, one item each, so the orchestrator can carry each to the Coach.
6. **No size budget moves**: `src/models/` is not exported, so no import shape measures it. A
   thread that exports it has gone out of scope.
7. **PRs** say "Stacked on #N": #368 for thread 1, the thread below for the rest.

## Threads

### 1. The models' test world, and three fixes to the forms

> **1. The models' test world, and three fixes to the forms.** The fixes first, each the Coach's (2026-10-30), each in `models-shapes.ts`, `storable.ts` and `listing.ts` together: (a) `staged` is null when none: `#staged` is `Fetched | null`, `combined` is `#staged ?? #central`, `hasStaged` is `#staged !== null`, the `staged` getter answers null, `stagedOrNull` goes, `cacheable.staged` is null when none, and the constructor, `storableArgs`, `makeThing`, `adopt`, `cacheable` and `hello` take null where they took central; (b) `boxSparse` keeps `whisper_codec` and `whisper_schema_version`, so a sparse record can be sealed over as it is; `sidecar`, `box_key_wrapped` and `whisper_ciphered` stay full-only; (c) an `Answer` is an `Outcome<Fetched | null>` with `scope` and `world` beside it, typed and checked as such, so whatever `Outcome` carries an answer carries (today, no `meta`). Then build `tests/test-helpers/models-world.ts` from the patterns in ground rule 7: `makeModelsWorld(opts)` returning the fake world, store, cache, their recorded calls, a `fullBoxRecord(overrides)` builder, and a `boxListingOf(world)` that constructs a `BoxListing` over them. Then `tests/models/models-shapes.test.ts`: every checker in `models-shapes.ts` accepts what its doc says and refuses with the kind its doc says, including `storableArgs`, `listingOpts`, `answer`, `notice`, `stagedForms` (the act-to-row rule), `boxRecord` strict and `boxSparse` stripping, and that a `Box` instance passes `boxRecord` as a duck while a pojo with an extra field does not. Then the first `box-listing.test.ts` cases: a listing checks its arguments; `build(dna)` holds a box born never stored (central at `NeverStoredSeq` with the draft's times, draft staged at revision 0, `expectedRevision()` null, present, in the snapshot); `build(record)` equals a `fetch` that delivers the same record, compared by `cacheable`; `build` of a dna with a whisper reaches the seal and refuses `unexpected_error`. Depends on nothing. Size: medium to large.

*Orchestrator:* Label `models_world`. Touches `models-shapes.ts`, `storable.ts`, `listing.ts`,
`box.ts` (any `stagedOrNull` caller), new `tests/test-helpers/models-world.ts`,
`tests/models/models-shapes.test.ts`, `tests/models/box-listing.test.ts`.
**Levels:** worker `sonnet` (the Coach's suggestion); review `medium`, `opus`.
**Depends on:** nothing in the sprint; cut from `origin/20261030-storable_base` (#368).
**Look-ahead:** every later thread builds on this world, so it covers the whole `Store`, `Cache`
and `BoxWorld` interfaces, not only what thread 1's tests call. The fake store's `put` takes and
records a third argument, `ifPresent`, unused until thread 8 honors it. `get` answers a scripted
record, null (nothing stored) or a refusal; `put`/`del` answer by default as ground rule 7 says
and can be told to answer otherwise (a `stale_write` with `meta.box_stored` full, sparse or
absent, for thread 3; a malformed answer); `watch` records `onNotice` and `fullFor` and returns a
recorded unwatch, so thread 3 can push notices. The world records `ensureTimely` and `takeWorld`
in call order with the store's calls, for thread 4a's "world first". The clock is settable and
the fake timer story is the one `src/helpers/trigger.ts` uses (vitest fake timers, if the trigger
schedules with `setTimeout`).
**Size:** medium to large.

*Review:* flagged, then clean (#370). The first review fixed the world's clock under fake timers
(a timer due partway through `mw.advance` read the end time), `useModelsWorld` making a world at
collection, two doc and title mismatches, and four style families. Its significant finding, a
damaged tombstone refused by `boxSparse`, was reworked by the orchestrator's YOLO ruling (a
damaged record arrives in the kind's sparse form; an open matter). Left: the module-level world in
`models-shapes.test.ts` (Cleanup, thread 7); forwarding builders on `ModelsWorld` (a decision);
three restatements of the tombstone rule in doc blocks (thread 3 collapses them).

### 2. The reconcile tables, row by row

> **2. The reconcile tables, row by row.** One fix first, the Coach's: a `record_conflict` kind joins `errors.ts` (class `condition`, with its row in the README's *Errors* table: storage and this device hold one revision of a record and disagree about it, so neither copy can be trusted until it is read again), and `cmpRevisions` and the one-revision-two-fates rows of `reconcileCentral` throw it in place of `corrupt_record`, which stays for an adapter answering in a shape its protocol does not allow. Then, in `tests/models/storable.test.ts`, drive `receive` through a `Box` from thread 1's world so that every row of the `reconcileCentral` table and every row of the `reconcileStaged` table is hit at least once, by age (older, same, newer) and shape (sparse, full, gone, ouch), with and without a staged record, including: the same revision under another tok refuses `record_conflict` from `cmpRevisions`; one revision, two fates refuses `record_conflict`; `fill` over a sparse central leaving a staged edit as it was; `adopt` and `gone` dropping a staged edit, whether or not its tok is the one storage now holds; `ouch` setting central to an ouchstone made of the held sparse props and carrying a staged edit to the revision after it; nothing stored (`receive(null)`) for a thing never stored reading as `same`; a stored tombstone's `revision_seq` moving the thing's own props. Each row's test names the row in its title. Where a row cannot be reached, or the code's result differs from the table, the thread file says so (ground rule 4). Depends on 1. Size: medium, judgment-heavy.

*Orchestrator:* Label `reconcile_rows`. Touches `src/errors.ts` (and wherever the kinds are
listed: `tests/errors.test.ts`, phrases, the README's *Errors* table), `storable.ts`
(`cmpRevisions`, `reconcileCentral`), `tests/models/storable.test.ts`, the loosened file for the
staged edits `reconcileStaged` drops or carries (brief, ground rule 2).
**Pulled in from thread 3:** `fetch` of nothing stored for a thing held alive refuses
`record_conflict` by the same-revision row. It throws in `receive`, before `ifAbsent` would be
asked, so it needs nothing of thread 3; it is tested through `listing.fetch` with the fake store's
`get` answering nothing stored.
**Levels:** worker `opus`; review `high` (every row is a judgment against a table).
**Depends on:** 1.
**Look-ahead:** thread 6 reads its thread file for every row found unreachable or differing.
**Size:** medium, judgment-heavy.

*Review:* fixed, reworked on the Coach's rulings, fixed (#373). The first review fixed the README
row (`takeWorld` runs before `receive` refuses) and named the operation, fetch, in every
`record_conflict` text. The rework made same-revision damage skip and a deletion over held damage
read gone (the Coach: "don't redefine the constants"), with a note above the table, and made the
refusal tell the customer. The second fixed the note's and messages' accuracy. Left, to the Coach:
`same | full | ouch` refusing `unexpected_error`; an older record resetting the refresh clock;
nothing stored over a damaged copy dropping a carried edit silently; `record_conflict`'s family.
For the restack: its listing test expecting `fetch` to throw `record_conflict` meets #372's rework.

### 3. The listing's pipeline

> **3. The listing's pipeline.** Three fixes first, the Coach's: (a) the device cache is written by the listing's `settle`, which is where consequences of new state belong, as the storable's `settle` holds its own: `settle(thing?)` saves `thing.cacheable` where a thing is given, then makes the snapshot; `#receiveInto` and `build(dna)` pass the thing, `hello`'s settle after `load` passes nothing, so a built draft is cached and a revived one is not written back; (b) `isWatchable` defaults to true; (c) `ifAbsent: 'fail' | 'nil'` on `fetch`, default `'fail'`, judged in `#deliver` once the answer is delivered: an answer of nothing stored, or of a tombstone deleted or damaged, throws `absentRefusal(scope)` under `'fail'` and resolves null under `'nil'`, in both cases after the instance held, if any, has received it and settled; `Storable.hydrate` passes `'nil'`, so a refresh in the background never errors into a bitbucket. Then, in `tests/models/listing.test.ts` and `box-listing.test.ts`: `fetch` of nothing stored refuses `absent_box`, whether or not a thing is held, and under `'nil'` resolves null, the held instance still at `at(scope)` as its tombstone; `fetch` of a stored tombstone likewise; ~~`fetch` of nothing stored for a thing held alive refuses `record_conflict` by the same-revision row, before `ifAbsent` is asked;~~ `build(tombstone)` holds a gone instance; `put(box)` and `put(record)` take one path, over `expectedRevisionOf(scope)` (null for a thing never stored or not held), and the answer spends the staged; `del(box)` at central's revision; a refused answer throws after `storedInStaleRefusal`'s record is delivered, for a `stale_write` carrying `meta.box_stored` full, sparse, and absent; a malformed answer, and an answer missing its `scope`, refuse `bad_record` before anything is delivered; a notice from the watch is delivered as an answer, and a refusal met on the way reaches `onBadNews` rather than throwing; `hello` revives from `load`, each box's `cacheable` round-tripping to an equal `cacheable`, writing nothing back, then starts the watch with `fullFor` naming the watchable scopes, every box among them until one is set otherwise, then hydrates all; `goodbye` ends the watch once; `save` is called once per settle given a thing, with that thing's `cacheable`: each delivery, each `build`; the listing's `snapshot` holds present things only, is the same array until one changes, and its listeners are called once per change. Depends on 1. Size: medium to large.

*Orchestrator:* **Fix (d), the Coach's (2026-10-30, ruling on thread 1's finding):** the
listing's snapshot shows exactly what the live instances show: it is the array of its present
things' own snapshots (`thing.getSnapshot()`), typed `readonly SnapshotT[]`, never a sparse
slice the listing makes itself. "If `listing.at('robert').sidecar.uncle === 'Bob'`, every other
legitimate access path to that record should be" Bob. It is the same array until one thing's
snapshot changes; a draft built from a dna shows its draft. The snapshot tests above are written
to it.
Label `listing_pipeline`. Struck test moved to thread 2. Touches `listing.ts`
(`settle`, `#receiveInto`, `build`, `hello`, `fetch`, `#deliver`), `storable.ts` (the `watchable`
default; the trigger's launch, `doTryLaunch: () => this.tryFetch()`, is where `hydrate`'s fetch
passes `ifAbsent: 'nil'`, through `Storable.fetch` to `listing.fetch`), `models-shapes.ts` if
`FetchOpts` or a checker needs `ifAbsent`, `tests/models/listing.test.ts`,
`tests/models/box-listing.test.ts`.
**Pulled in from thread 4:** `isWatchable` is a plain get/set, true until set (it tests fix (b)).
**Levels:** worker `sonnet` (the Coach's suggestion); review `medium`.
**Depends on:** 1.
**Look-ahead:** thread 8 hands `ifPresent` through `listing.put`, so `put`'s signature stays
plain enough to take a third argument. Thread 4a changes `hydrate`'s body; this thread touches the
trigger's launch line, not `hydrate`, so the two meet at restack only if both reach the same line.
**Size:** medium to large.

*Review:* flagged, reworked, flagged (#372); waits unfiled on the Coach. The first review fixed
doc and test wording; its finding on `hello` replacing a held instance was reworked (YOLO:
`hello` revives only scopes not held; a replaced instance is unsubscribed). The rework also built
the Coach's bad-news ruling (catches in `#receiveInto` and `settle` telling `onBadNews`). The
second review fixed two catch-ordering bugs and flagged that a delivery refusal no longer reaches
a `fetch`/`put`/`del` caller (against CLAUDE.md's "reported by throwing"; a refused background
refresh then counts as success). A TOP row; thread 8 waits on it. Left: listeners before the
cache save (a row); a replaced instance's trigger left running; `hydrateAll` telling one world
refusal per instance.

*Orchestrator (2026-10-30, the rework on the Coach's rulings):* rebased once, onto 4b's filed tip
(bc53f4e8, after its rework), by the rework worker. Act on: (M) the throw rule: "Throwing means
'We fundamentally cannot give you what you asked for, and need to wreck everything in
consequence'. If you can give them what they asked for, no throw. If not, throw."; reporting
through `onBadNews` stays, and a refused delivery never counts as a refresh; (L) one pipeline:
"everything should go through a common scheme: hello, send, anything -- buildOrReceive, so that
there's no way for anything to be built more than once", with a survey for other places the rule
is broken, `build(dna)` over a held scope among them; (Q) a refused background refresh other than
absent goes to `onBadNews`; and, from 4b's second review, the trigger notes success only by
`receive`'s verdict, never on any ok fetch (the Coach's timeliness rule on the fetch path). From
4b: `fetch` alone judges `ifAbsent`. Restate thread 2's listing test that expects `fetch` to throw
`record_conflict` wherever the throw rule changes it. Worker `opus` (the rulings turn on
judgment); review `medium`.

*Review (third, over the rework f1f715fc...71d19b59, medium):* fixed (#372). One fix: `#bornOf`
renamed `#makeThingFor` (a make verb; it constructs) (28190db2). The worker's choices hold;
`#buildOrReceive` holds before its first await, so no double build. The rework's push was refused
by the permission check (a TOP row). Left: the timer stopping after a refresh that is not a
success (thread 10, a row); the rest to thread 10.

### 4a. Hydrate and timeliness

> From the Coach's thread 4, split as it asks ("split hydrate and timeliness from the verbs and guards"): fixes (a), (b), (c), and these tests, in `storable.test.ts` and `box.test.ts`, with the fake clock: `hydrate` fetches when the record is untimely by `maxMillisSinceRefresh` and not when timely, fetches a sparse central however timely and never a never-stored one for that reason, calls made during a fetch join it, the world's `ensureTimely` is called first every time; `maxMillisSinceRefresh: Infinity` fetches nothing, for a thing never fetched too; after a failed fetch no launch is scheduled and the next verb launches on demand; a horizon past `MaxTimerMillis` arms no timer and still reads stale by its value once passed; success is noted on a full record and on a tombstone, not on a sparse one.
>
> The Coach's fixes, verbatim from thread 4: (a) `whole` is a term: a record is whole when it is full or a tombstone, what storage would hand back complete; sparse is not. `isWholeRecord(record)` sits beside `classifyRecordShape` in the base, and `receive` notes success on a whole record, as it does today under two names. (b) `hydrate` fetches whatever the age when central is not whole (`ensureTimelyWithin(0)`, one line, no new method): a draft's central is the never-stored tombstone, whole, so creation is not forced to fetch. (c) `Trigger.isTimelyWithin(Infinity)` is true, for a thing never fetched too, by one line at its top (spec, *Please Remember!!*: Infinity means go ahead; `now - (-Infinity) < Infinity` would still be false, so the line is explicit).

*Orchestrator:* Label `timeliness`. Touches `storable.ts` (`receive`'s success line, `hydrate`,
`isWholeRecord` beside `classifyRecordShape`), `src/helpers/trigger.ts` and its existing tests,
`tests/models/storable.test.ts`, `tests/models/box.test.ts`.
**Levels:** worker `opus`; review `medium`.
**Depends on:** 1.
**Look-ahead:** 4b is cut from this thread's tip; its *send of a draft with Infinity fetches
nothing* rests on fix (c). Whether `trigger.ts` is used by the old code too: a change to it must
keep the old code's tests green.
**Size:** medium.

*Review:* fixed (#371). Fixed double quotes in test strings, two test titles using the retired
`payload`, and the corrected `MaxTimerMillis` docs (untimely once the launch is due, at
`eagerFrac`). Left: `isTimely` true over a newly received sparse central (an open matter); an
older full answer to a sparse central noting success (bounded); a purged sparse central refusing
on `receive(null)` (beside thread 2's stuck-box matter); `isWholeRecord` duplicating
`classifyRecordShape` (the Coach's spec); banners named for a thread, not a concern (4b renames
them); an `it.todo` title carrying a question (shortened once ruled).

### 4b. Verbs and guards

> From the Coach's thread 4, split as it asks: fixes (d), (e), (f), (g), and these tests, in `storable.test.ts` and `box.test.ts`: `edit` with a sidecar patch stages a record at `nextRevision` with `written_at` now and leaves central untouched, three times in a row staging the same `revision_tok` against central's revision, a fresh one after a `send` whatever its outcome, and a fresh one after central changes; `send` is `edit` then `put`, returning `this` once the answer is adopted; `send` of a sparse box with no whisper refuses from `makeStaged`, `bad_option`, and `send` of a draft with `maxMillisSinceRefresh: Infinity` fetches nothing; `del` stages a tombstone then deletes; a second `del` passes the guards and deletes again at the tombstone's revision, and `del` of a damaged box deletes at the ouchstone's revision (what the fake store answers to each is the thread's to decide and record: a tombstone at the next revision reads `gone`, the same tombstone reads `same`); *The absent contract*: `unsealWhisper` of a gone or damaged box refuses `absent_box` from its guard, ahead of the seal's `unexpected_error`; rebirth: `edit` on a deleted or damaged box passes the guards and the record made is alive at the next revision with `registered_at` now, a second `edit` over that staged rebirth keeps its `registered_at`, and `send` puts it over the tombstone's revision; `receive` of a newer record registered at another time moves the own prop; locked: `demandUnlocked` refuses `vault_locked` from `edit`, `send`, `del` and `unsealWhisper` at their entry, and a lock that comes down after entry, during `makeStaged` or between `edit` and `put`, stops nothing, `box.whisper` reads `LOCKED`, `isLocked` follows the listing's word; the `try` forms resolve outcomes and never reject. ~~`isWatchable` is a plain get/set, true until set.~~
>
> The Coach's fixes, verbatim from thread 4: (d) `send` needs no record at all, and no verb checks the lock mid-flight (the Coach, 2026-10-30: an operation that passed its guards completes even if the lock comes down before it returns): `ensureReadyToSend` and `demandReadyToSend` go, `send` is `edit` then `put` with nothing between, and the `demandReadyToEdit()` after `makeStaged` in `edit` goes with its drift comment; `demandFull` and `notFullError` go if nothing else calls them, since `edit`'s `makeStaged` already hands back a full record or refuses and `listing.put`'s `recordOf` refuses a duck that is not one; `demandReadyToDel` is `demandUnlocked` alone, since deleting a deleted or damaged thing is no error. (e) `registered_at` follows the record in hand: it leaves the non-writable tattoo (which keeps the scope and `vault_tok`) and joins the revision props `assign` sets, and `edit`'s base takes `registered_at: now` where the record in hand is a tombstone, since a thing edited back to life is registered anew; where an earlier edit already staged the rebirth, the record in hand is that staged record and its `registered_at` stands. (f) The next revision is stable until it is sent: `nextRevision(ante)` memoizes what it mints, in a private field holding the revision and the `revision_tok` of the `ante` it followed, and answers the same revision while `ante`'s tok is the one memoized; `send` and `del` clear the field before they hand the record to the listing, so edit, edit, edit, send, edit, edit stages two toks, not five, and a failed send is followed by a fresh one (the stamp binds the tok, so it is settled before `makeStaged` seals, as `edit` already orders it). No new method: the field, the check in `nextRevision`, and one assignment in each of `send` and `del`. (g) The box's guard pairs exist ahead of the seal: `ensureReadyToUnsealWhisper(opts)` hydrates then `demandReadyToUnsealWhisper()`, which is `demandUnlocked().demandPresent().demandFull()`, called by `unsealWhisper` in place of its `hydrate` and `demandUnlocked` lines; `ensureReadyToSeal` and `demandReadyToSeal`, the latter `demandUnlocked()`, called by nothing yet.

*Orchestrator:* Label `verbs_guards`. Struck test moved to thread 3. Touches `storable.ts`
(guards, `edit`, `send`, `del`, `nextRevision`, `assignInitialProps`, `assign`, `revisionPropsOf`),
`box.ts` (`unsealWhisper`, the new guard pairs; `#unseal` still calls `demandFull`, so `demandFull`
likely stays), `models-shapes.ts` if a revision-props shape lists `registered_at`,
`tests/models/storable.test.ts`, `tests/models/box.test.ts`, the loosened file (rebirth's
`registered_at`, the tombstone keeping the buried record's time, the brief's *For the Coach*).
**Levels:** worker `opus`; review `high` (the guards and the lock are what `notes/guarantees.md`
speaks to).
**Depends on:** 4a (cut from its tip).
**Look-ahead:** thread 8 hands `ifPresent` from `send` to `listing.put`; `send`'s opts carry it.
Thread 5's own-keys test counts the tattooed keys; fix (e) moves `registered_at` from the
non-writable tattoo to the writable revision props without changing the count, which thread 5
should not depend on beyond that.
**Size:** large.

*Review:* flagged (#375); waits unfiled on the Coach. Fixed `del`'s doc (staged at the next
revision, over the tombstone's) and three style families. Significant, to the Coach: central can
move while `edit` awaits `makeStaged`, and `send` then overwrites the newer record (a TOP row).
Left: `registered_at` renewed by an edit during an in-flight `del` (a row); `notFullError`'s
advice after a hydrate; missing doc blocks on the `ensureReadyTo...` guards; `it.todo` titles
carrying questions (Cleanup); loosened-file titles citing file:line.
*Review (second, over the rework b19fbfbf...a100fc4e, high):* fixed (#375). One fix: the
`hydrate` test of a sparse central with a full edit staged built its box outside the listing, so
the box under test received nothing (bc53f4e8). Agreed with "central or combined whole" and
`movedUnderEditError` on `stale_write`; `vault_remade` is an existing kind. Left: the whisper
setter refusing `null` while locked (thread 9, a row); the trigger noting success on any ok
fetch (thread 3's rework); own props drifting under another life, and another life over a
tombstone (rows); `stale_write` without `box_stored` and inline thrower sentences (thread 9);
G6/G7 amendment (thread 6).

### 5. The snapshot and the props

> **5. The snapshot and the props.** One fix first, the Coach's: the sidecar is not readable while the vault is locked. `LOCKED` becomes `Symbol.for('LOCKED')`, and `box.sidecar` answers the bag `{ [LOCKED]: true }` while locked, so the snapshot's `sidecar` carries it too; unlocked, the sidecar as today, null unless full. `box.whisper` keeps answering the symbol itself. Then, in `box.test.ts` and `storable.test.ts`: `getSnapshot` returns the same frozen object until a `settle` changes it, and a `settle` that changes nothing notifies nobody; `subscribe` returns an unsubscribe that works; the box snapshot carries the scope, the revision props, `registered_at`, `written_at`, `sidecar` (null unless full, the locked bag while locked), `full`, `present`, `exposed`; after `receive`, `edit` and `del` the own props `revision_tok`, `revision_seq`, `written_at` and `registered_at` follow the record in hand, and `scope` and `vault_tok` never change (the tattoo is non-writable); `toJSON` is the sparse form of central; `cacheable` is `{ ...sparse, central, staged }` with `staged` null when nothing is staged and no sidecar on the sparse or on any tombstone; a box's own enumerable keys are exactly the nine the base tattoos, and `scope` is a getter over one frozen object. Depends on 1. Size: small.

*Orchestrator:* Label `snapshot_props`. Touches `box.ts` (`LOCKED`, `sidecar`, `BoxSnapshot`'s
`sidecar` type), `tests/models/box.test.ts`, `tests/models/storable.test.ts`.
**Caution:** `registered_at` following the record in hand after `edit` over a tombstone is thread
4b's fix (e). This thread runs beside 4b, so it tests `registered_at` only where the code today
already moves it (`receive`); the rebirth case is 4b's.
**Levels:** worker `sonnet`; review `medium` (the locked sidecar is a read path while locked).
**Depends on:** 1.
**Size:** small.

*Review:* flagged, filed as built (#376; the orchestrator's call: both findings already rows and
neither a defect of this change). Fixed word-rule test titles, doc blocks one fact per sentence,
and an `it.todo` title. Significant, both rows: a snapshot made before the lock keeps the
sidecar (nothing settles boxes on lock); `cacheable` shows the sidecar while locked. Left:
`listing.put(box)` on a locked box refuses `bad_record`; `Sidecar`'s doc in `src/shapes/box.ts`
(thread 6); a cloned snapshot turns the bag into `{}`.

### 7. The dna at `build`'s door

> **7. The dna at `build`'s door.** Today a dna is checked only when it reaches the constructor, through `boxscope.parse` inside `makeThing`: a one-letter boxlabel refuses `bad_record` from deep in the stack. Per VOCABULARY.md *duckish* and CLAUDE.md *Validate at each module entrypoint*, `BoxListing.build` parses its dna on its first line with a `boxDna` checker in `models-shapes.ts` beside `boxRecord`: the scope required, the record's props optional, `whisper` optional, the factory's own props (`fmt`, `am`, `vault_tok`, the revision and times) allowed and stripped, refusing `bad_option`. This is the one piece of surface the sprint adds, and it is a validator, not a method. Tests in `box-listing.test.ts`. Depends on 1. Size: small.

*Orchestrator:* Label `box_dna`. Touches `models-shapes.ts` (`boxDna`, made in a `Checkers`,
`Checker` or `objCheck` call, STYLE.md *Validation*), `box-listing.ts` (`build`'s first line),
`tests/models/box-listing.test.ts`, `tests/models/models-shapes.test.ts`.
`build` takes a dna or a record (`BoxDna | Fetched`); the checker applies to the dna branch only.
**Levels:** worker `opus` (the Coach's suggestion); review `medium`.
**Depends on:** 1.
**Size:** small.

*Review:* fixed (#377). Fixed `boxDna`'s doc opening and `draftOf`'s invariant as a comment.
Left: a dna with `revision_seq: undefined` read as a record; `build(null)` throwing a bare
`TypeError`; sealed parts without a sidecar given `{}`; `BoxDnaFilled` beside `BoxDna`; stripped
keys listed by hand. The worker's four open matters confirmed (three rows, one my call).

### 8. `ifPresent`

> **8. `ifPresent`.** The policy as it is needed now (the Coach, 2026-10-30), and no more of it. `ifPresent: 'fail' | 'fetch' | 'replace'` on `send`, handed through `listing.put` to `store.put(record, expected, ifPresent)` and judged by storage, where the record is: it applies when `expected` is null, a thing this device believes never stored, and storage holds one: `'fail'`, the default and what happens today, refuses `stale_write` carrying the stored record; `'fetch'` writes nothing and answers the stored record, so the staged is dropped as any newer record drops it (the old `ensureBox`); `'replace'` writes over it. With `expected` given, the compare-and-set stands whatever `ifPresent` says. The fake store honors all three. Tests in `listing.test.ts`, `box-listing.test.ts` and `box.test.ts`; the `ifPresent` row of the README's `putBox` promises is thread 6's to list as touched. Depends on 3 and 4. Size: small to medium. Open for the Coach: whether `ifPresent` should also speak when `expected` is given and stale, where `'fetch'` would be today's `stale_write` without the throw.

*Orchestrator:* Label `if_present`. Touches `models-shapes.ts` (`ifPresent` exists already, with
`sendOpts`), `storable.ts` (`send`), `listing.ts` (`put`), the `Store` type,
`tests/test-helpers/models-world.ts` (the fake store honoring all three),
`tests/models/listing.test.ts`, `box-listing.test.ts`, `box.test.ts`.
**Levels:** worker `opus`; review `medium`.
**Depends on:** 3 and 4b. Cut from the top of the two once restacked into a line.
**Size:** small to medium.


*Orchestrator, after the Coach's ruling (2026-10-30) on P3:* "Yes, the semantics of ifPresent are
pretty doubtful in a versioned update process. remove it as one of the options (unless it's
needed for something, in which case narrowly limit its contract)". **Thread 8 is now: remove
`ifPresent`** (`ifPresentVals`, `ifPresent`, `sendOpts`' field, the fake store's third argument,
any doc naming it), unless a survey finds something that needs it, in which case narrow its
contract and say why. Label `if_present` kept. Worker `sonnet`; review `low`. Depends on 4b's
rework (it touches `send`'s opts); cut from 3's filed tip, the top of the line. Size: small.

*Review:* clean (#381, low). No fixes. The survey found nothing that needs `ifPresent`, so it is
removed, not narrowed; `sendOpts = timelyOpts` keeps `send`'s option type. Left: a ragged wrap in
the options doc block (a documentarian pass); the scenario and spec rows naming `ifPresent`, the
Coach's to strike (Cleanup).

### 9. The Coach's rulings of 2026-10-30, the rest

*Orchestrator:* rulings that land in code no other thread is working in. Label `rulings`.
1. `same | full | ouch` takes `fill` (the Coach: "fill"), a row in `reconcileCentral`'s table.
2. A `same` answer to a `del` drops the staged tombstone (took the Rec), a row in
   `reconcileStaged`'s table or the one line in `receive` that ends early.
3. `record_conflict` stays a `condition`; its README row and messages say a retry is worth one
   try, and if it persists the system is not working (the Coach: "it is worth a retry I guess. The
   system is fundamentally not working if this happens").
4. `cacheable`: "who needs cacheable besides .handle? If nobody, make it protected". Survey every
   reader (the listing, the cache, tests); narrow it so a host holding a box cannot reach it,
   giving the listing what it needs by the plainest means the language allows.
5. A TODO.md entry (the Coach: "yes, TODO"): an edit is never saved to the device cache, so an
   unsent staged edit is lost on reload.
6. *Orchestrator (YOLO, a Coach row):* `box.whisper = null` (and `LOCKED`) passes while the vault
   is locked; only a new whisper needs it unlocked (#375 second review: the exposed whisper is
   kept through a lock "until the host sets it null", and the setter refused that while locked).
7. `edit`'s mid-edit `stale_write` (`movedUnderEditError`) attaches central as
   `meta.box_stored`, as `RefusalMeta` documents for `stale_write`.
8. The inline thrower sentences in `storable.ts`/`box.ts` (`movedUnderEditError`,
   `vaultRemadeError`, `notFullError`, `lockedError`) move to `phrases.ts` (STYLE.md *What a
   refusal says*).
9. A record under a `vault_tok` other than the one held throws `unexpected_error`, over a living
   central or a tombstone alike (the Coach: "If box receives a record with a different vault_tok
   it should throw unexpected error, I'm pretty sure we will want to flush all instances and
   remake them"). This replaces 4b's `vault_remade` refusal, and `assign` stops taking a new
   `vault_tok` over a tombstone. A TODO.md entry: flush and remake every instance on a remade vault.
10. A dna carrying `revision_seq` is refused (the Coach: "go ahead to have the validator reject");
    it is today, as a record held to the record check. `boxDna`'s doc stops listing `revision_seq`
    among the props it takes and strips.
**Hands off:** `registered_at`'s logic, and anything more built on `boxDna`/`hasRevision`: the
Coach is looking into both ("There's something weird about the constraints on it"; "There is
something broken about my conception of making a record").
Tests beside each. Worker `opus`; review `medium`. Depends on 8 (cut from its tip). Size: medium.

*Review:* fixed (#382, medium; 2 compactions). Five fixes: test banners and titles that narrated
the rulings' history, `ToCacheable` through `MSX`, two doc blocks, the `delSpent` comment. Left:
a box listing holding no instance takes in a record under any `vault_tok` (`#makeThingFor` births
from the record itself; the gap predates the thread): thread 10, item 8; a cached box from before
a remade vault throws on every hydrate (the TODO's flush-and-remake covers it); two
`as unknown as` casts into `RefusalMeta`'s old forms (cleanup, the match-up); `VaultListing`'s
`staleMetaOf` untested (no vault-model tests yet); `Phrases.VaultLocked`'s "nothing was read or
written", shared package-wide (cleanup).

### 10. The listing's loose ends

*Orchestrator (2026-10-30):* from thread 3's third review, split from 9 so neither outgrows one
context. Label `listing_ends`.
1. *YOLO, a Coach row:* the storable reschedules its timer after any launch that completes,
   without noting success, so a box answered by an older record stays untimely and keeps trying at
   its horizon; a refused launch still stops the timer.
2. The listing calls the host's `onBadNews` guarded, as Vault's `#handlerThrew` does, so one that
   throws inside the timer's callback is no unhandled rejection.
3. `MSX.answer` (or `#deliver`) refuses `bad_record` when a record's scope differs from
   `answer.scope`.
4. `hello` checks what `#cache.load()` resolves to as an array of cacheables; a malformed result
   is a cache miss, told to `onBadNews`.
5. `Storable` is handed a tell function when it is made; `Listing.tellBadNews` goes back to
   protected.
6. A refusal reaches `onBadNews` once when `hydrate` or `hydrateAll` joins a timer launch
   (bad-news item 8).
7. *Orchestrator, the Coach's ruling (2026-10-30):* a TODO.md entry: making a box will seal it
   (the Coach: "you have to seal (via some unspecified-as-yet-by-me step) as part of making a new
   box. So the box is never sparse"); once it does, timeliness asks whether the record in hand is
   whole, and `#holdsWhole`'s union with central goes. Nothing in code changes now.
8. *Orchestrator, from #382's review (YOLO):* `#makeThingFor` (or `#buildOrReceive`, before birth)
   compares a record's `vault_tok` with `BoxWorld.vault_tok` (the vault's, for the vault listing
   if it has the like) and throws `unexpected_error` on a mismatch, by the same rule as item 9 of
   thread 9: today a listing holding no instance for the scope births one from the record itself,
   so the check compares the record with itself.
Tests beside each. Worker `sonnet`; review `medium`. Depends on 9 (cut from its tip: both touch
`listing.ts`). Size: medium (eight items; if it compacts twice, split what remains).

*Review:* fixed (#383, medium; no compaction). The suspected item-1 bug was real: `isTimely` is
`now < launchAt`, so scheduling the next launch after an older record made the box read timely;
`Trigger` now reads untimely until a success is noted, the retry still scheduled. Also two doc
blocks, a banner, three style fixes. The thread file's *Built* 1 and *Discoveries* still say the
old behaviour; the PR comment supersedes them. Left: a held box answered absent or gone polls at
every horizon and nothing disposes triggers (cleanup, the listing's lifecycle); `#told` dedupes by
error identity (my call: accept); the answer's scope is never compared with the scope asked, and a
cached copy's staged `vault_tok` is unchecked (both to thread 11); refused cached copies stay in
the cache; `tellBadNews`'s one long doc line.

### 14. Build seals what it stages

*Orchestrator, the Coach's ruling (2026-10-30), on thread 7's sealed-parts row:* "Ideally we'd
have as an invariant that the box was always full; we can't, but we have (afaict in all but this
case) the invariant that the box can be made full by refreshing. Here, we have to either start
janking in special flags and messing with the data model, or require that a new record must be
sealed immediately. Can you stub out seal to make placeholders for the needed fields, and somehow
or another have build seal any staged data? It sounds like most other things are demonstrable but
this needs a whole lot of upcoming work that it is blocking for needing that upcoming work".
Label `build_seals`. Runs next after thread 10, ahead of 11-13.
1. **A stub seal** in the models: it makes the sealed fields a full record needs
   (`box_key_wrapped`, `whisper_ciphered`, whatever `isFullRecord` asks) as placeholders, shaped
   right, plainly marked a stub until the vault's seal lands. **No secret material in them, ever**:
   a placeholder is a constant or random bytes, never derived from or carrying the whisper or any
   key (CLAUDE.md, *Secret material never leaves through a side door*; *Never invent
   cryptography*: this is a placeholder, not a construction). Survey first: 4b's seal guard pairs
   and `fakeSealBoxListingOf` in `models-world.ts` may already give the seam; build on it.
2. **`build` seals what it stages:** `build(dna)` stages revision 0 over the shim and seals it
   before it returns, so a built box's record in hand is full. A dna's whisper, if it carries one,
   is what the seal takes in.
3. **`boxDna` drops `box_key_wrapped` and `whisper_ciphered`** (thread 7's Rec, the row this
   ruling answers): sealed parts never come from a dna; its strictness refuses them.
4. **Timeliness asks of the record in hand alone:** with a built box full, `#holdsWhole`'s union
   with central goes (the Coach's earlier "the box is never sparse"); remove thread 10's TODO.md
   entry (item 7) that waited on this. Restate the tests that pin the union (4b's "send of a draft
   with Infinity fetches nothing" should still pass, the draft now whole).
**Hands off, lifted for this thread** by the Coach's direction: `build` and `boxDna`; `registered_at`'s
logic stays hands off. Worker `opus`; review `high` (a seal stub sits next to secret material).
Depends on 10 (cut from its tip). Size: medium.

*Review:* fixed (#384, high; 1 compaction, ~12 minutes in, before the first justify). The whisper
traced by hand: `draftOf` takes it from the dna, `stubSeal` drops it unread; it reaches no record,
cache copy or snapshot. One fix: sealing over a live box still sparse after hydrating, with no
sidecar given, staged `{}` over the stored sidecar (new with this thread; `makeStaged` now
refuses `bad_option`, `NoSidecarToCarry`). Left: a whisperless dna builds a full box (a Coach
row); a stub-sealed box can be sent, `build` seals before the held check, the seal's seam (the
real seal's thread, cleanup); `models/Vault.lockState()` always locked (the lease); locked
before malformed and a synchronous stub throw (my calls: keep).

### 11. `ifPresent: 'replace'`

*Orchestrator, the Coach's note (2026-10-30), after thread 8 filed:* "Accept ifPresent as a flag.
Document that it is optional and may only take the value 'replace'. We might actually need it for
vault, later. In the spec, note that the other flags will not be implemented until a clear need
and scenario table arrive". Label `if_present_replace`.
`ifPresent?: 'replace'` on `sendOpts`, the one value; `send` hands it through `listing.put` to
`store.put(record, expected, ifPresent)`; storage judges it: with `expected` null (a thing this
device believes never stored) and a box stored, `'replace'` puts over it; absent, the
compare-and-set refuses `stale_write` as today; with `expected` given, the compare-and-set holds
whatever `ifPresent` says. The fake store in `models-world.ts` honours it. Doc blocks say it is
optional and takes only `'replace'`. In `whiteboard/20261028-storable_base/storable-spec.md`, a
note where `ifPresent` is described: `'fail'` and `'fetch'` will not be implemented until a clear
need and a scenario table arrive. Also, from #383's review, two listing guards: `fetch` (or `#deliver`) refuses `bad_record` when
`answer.scope` differs from the scope asked; `hello`'s birth check (`#demandRecordOfVault`) covers
a cached copy's staged `vault_tok` as it does its central. And, if the Coach flips the row, the
storable's `settle` hands its cacheable to the listing's save, so `cacheable` becomes `#`-private
and `ToCacheable`/`cacheableOf` go.
Tests in `models-shapes.test.ts`, `listing.test.ts` or
`box-listing.test.ts`, `box.test.ts`. Worker `sonnet`; review `medium` (raised from `low` for the two guards). Depends on 14 (cut from its
tip; 10 and 11 both touch `listing.ts`). Size: small.

*Review:* flagged (#385, medium; no compaction). Three test fixes (the tombstone path never
reached `expected: null`; a box test that checked no option; alignment). **Significant:** a
replacing put wrote the minted seq 0 over a higher stored seq, so other devices judged it older
and diverged, and the race made `record_conflict`. *Orchestrator (YOLO, a TOP row):* reworked so
storage puts a replacing record at stored seq + 1 under the replacing tok. Left: the faithful
fake (thread 16); whether `'replace'` skips `send`'s hydrating fetch (a row); a cached copy's
staged scope unchecked against its central's; doc-block tidies (a documentarian run).

*Review (second, over the rework b0877371...94ae442e, medium):* flagged (#385). One style fix.
**Significant:** storage renumbering a replacing record collides with the seal: the record is
sealed at the minted seq, the stamp carries `revision_seq`, so under the real seal a replaced box
would refuse to open. Options: (a) the stamp binds `revision_tok`, not `revision_seq`; (b) storage
refuses and the device re-mints and reseals; (c) `'replace'` unimplemented until the scenario
table. A TOP row. *Orchestrator:* filed as built against the default that a twice-flagged thread
waits, since it is correct under the stub and (a) needs no change; under (b) it is reworked and
the line restacked. Left: a plain put over a tombstone lands below it; a damaged record's
unreadable seq (both to thread 16 and the `Store` contract); doc blocks; the race test's title.

*Orchestrator (2026-10-30), the Coach's ruling on what `'replace'` means:* "no new operation was
planned or intended. the old compare-and-swap is the only thing meant ... a 'versioned replace'";
"ifPresent: 'replace' only means the default implementation exactly as described in the spec".
The overwrite this thread built (and its seq + 1 rework) was a misreading, taken from the brief's
thread 8 text ("'replace' writes over it"). #385 is back in draft and reworked: every put is the
compare-and-swap (revision 0 lands over no row only, a tombstone counting as a row; revision N
over the very record at N - 1, tok and seq; otherwise `stale_write` carrying what is stored);
storage never renumbers or patches; `ifPresent: 'replace'` accepted and inert, handed to nothing;
the spec's `ifPresent` entry becomes the Coach's table (`'fetch'` not implemented, a live N - 1
under it open). The seal-stamp and skip-refresh rows are retired as moot. Then a short review of
the rework, #387 restacked onto it with a lease, both filed.

### 16. The store's versioned replace

*Orchestrator, the Coach's ruling (2026-10-30):* "We need the store to enforce that the versions
strictly increment by one each time, besides also naming the prior token. So we don't need to
(and should not) send the expected prior seq; the vaultDB implementor may implement the +1 rule as
a calculation or code it into the query. I hate using null as a sentinel, so this also gives us a
little safety: 'no row' requires expected null and revision_seq 0 -- either without the other is
an inconsistent refusal." On `'fetch'` and a live N - 1: "the ifPresent flag only makes sense
against an assumption it doesn't exist, and that would be enforced at send and on server ... this
is why we're not implementing it yet. Add your table, with question marks and shrug emojis where
there's ambiguity." Label `versioned_replace` (was `faithful_fake`).
1. **The contract.** `Store.put(record, priorTok)` and `Store.del(scope, priorTok)`: `priorTok` is
   the `revision_tok` of the record the device holds, null when it holds none; no prior seq is
   sent. A put lands only (a) over no row, with `priorTok` null and the record's `revision_seq` 0,
   or (b) over the row whose `revision_tok` is `priorTok`, with the record's `revision_seq` that
   row's seq + 1; storage computes or queries the + 1 itself and never renumbers or patches.
   Otherwise: a row under another tok refuses `stale_write`, carrying it; no row with a
   `priorTok` given refuses `stale_write` carrying nothing (today's path for an absent
   `meta.box_stored`); `priorTok` null with a seq other than 0, a `priorTok` with seq 0, or a seq
   other than the row's + 1, is **inconsistent**: survey `refusalKindVals` and use the existing
   kind that fits a request the device should never make (YOLO; say which in the thread file and
   the PR's open questions, for a Coach row). `del` follows the same tok rule; storage makes the
   tombstone at the row's seq + 1 under a fresh tok; what `del` with `priorTok` null over no row
   does today, keep and name in the thread file.
2. **The device.** The listing sends `priorTok` (`expectedRevisionOf` becomes the tok alone, or a
   successor so named), and checks the pairing (null with seq 0, a tok with seq > 0) before it
   sends, refusing the same inconsistent kind; the storable already mints seq = central's + 1.
3. **The fake store** in `tests/test-helpers/models-world.ts` enforces all of it for `put` and
   `del`. Fix the seeds of tests that put or delete over a record they did not hold (about 9 across
   `listing.test.ts`, `box.test.ts`, `loosened.test.ts`), changing no assertion's subject; list
   each. Tests for every cell of the `'replace'` row below.
4. **The spec** (`whiteboard/20261028-storable_base/storable-spec.md`, the `ifPresent` entry #385
   wrote): restate it in these terms, with the table below (the Coach: "Add your table"). A
   revision lower than expected is the Coach's "whatever refusal we do now"; note in the thread
   file that the device then judges what is stored older and stays stuck, for the Coach.

```
| `ifPresent` | no row; prior tok null, N = 0 | row under the prior tok, a tombstone; N = its seq + 1 | row under the prior tok, alive or damaged; N = its seq + 1 | a row under another tok | no row; a prior tok given | prior tok null with N ≠ 0, a tok with N = 0, or N ≠ seq + 1 |
|---|---|---|---|---|---|---|
| `'replace'` (default; the only one implemented) | lands | lands | lands | `stale_write`, carrying it | `stale_write`, carrying nothing ❓ | refused, inconsistent (kind ❓) |
| `'fetch'` (not implemented) | lands | lands | 🤷 the flag assumes no such row | answers it, `ok: true` ❓ (if newer? 🤷) | 🤷 | refused, inconsistent |
```
Worker `opus`; review `medium`. Depends on 12 (cut from its tip). Size: medium.
*Review:* fixed (#388): `Phrases.PutUnfitForPrior` no longer blames the host, since storage also gives it to a held box put unedited at central's own revision; the `Store` doc block's bullets restyled. Left, minor: a purged row sticks the device (the twin of the lower-revision case; thread 19); "carrying nothing" is an absent `meta`, not `box_stored: null` (a Coach row); long doc-block sentences (documentarian); three stale test titles ("expects no revision…", now asserting `priorTok` null; thread 17 renames them); the pairing rule written twice, in the listing and the fake (kept, so the fake models storage on its own).

### 12. The sidecar, locked or not

*Orchestrator, the Coach's ruling (2026-10-30):* "OK make sidecar visible when locked or
unlocked". Label `sidecar_visible`. `box.sidecar`, and the snapshot's `sidecar`, give the sidecar
whether the vault is locked or not; thread 5's `LockedSidecar` bag goes from the sidecar (keep
`LOCKED` wherever else it is used, such as the whisper); `Box.sameSnapshot` compares the sidecar
as the other fields are once no symbol-keyed bag needs identity. Thread 5's and 4b's tests that
pin the LOCKED sidecar are restated. `send` keeps putting its staged record (the YOLO call of the
restack). Also, two more rulings of the Coach (2026-10-30, the convenient thread):
* ~~`cacheable` private~~: moved to thread 17 (147 references to rewrite, mostly tests: one
  ruling, one thread).
* **The double edge, documented and tested** ("As long as we can document and test the outcome,
  I am fine with the double edge case meaning that we could have possibly saved the data ... but
  instead were forced into a different defensible policy of unstaging the edit"): an end-to-end
  test that a staged edit carried past damage (newer `ouch`) is dropped, with no refusal, when
  storage then answers nothing stored; and a line in `reconcileCentral`'s damage note saying so.
Worker `sonnet`; review `medium`. Depends on 11. Size: small.

### 17. `cacheable` private

*Orchestrator, the Coach's ruling (2026-10-30):* "Make private, in whatever thread is convenient".
Label `cacheable_private`. The storable's own `settle` hands its cacheable to the listing's save
(a push, not a pull), so `cacheable` is a `#` field nothing outside reads; `ToCacheable` and
`cacheableOf` go. Tests that read central and staged through `cacheableOf` (about 147 references)
assert instead on what the fake cache saved (`mw`'s cache calls), on the snapshot, or on what was
put; a test helper may read the fake cache's last save for a scope. Behaviour unchanged: the
cache is saved when it is today (each delivery, each build; never on `hello`'s revive). Worker
`sonnet`; review `medium`. Depends on 16 (cut from its tip). Size: medium (mechanical, wide).
*Review:* flagged (#389): a public `Listing.keepCopy` was a typed write door into the next cache save; reworked to `[MSX.KeepCopy]`, a symbol keyed like `IsListing` (off the typed surface; reflection still finds it), with a note above `adopt` that every adopt is followed by `settle` and a test that a 'same' delivery saves the current state. Second review fixed: that test tightened, doc blocks corrected. Left, minor: a symbol is not a barrier (an ES-private channel would be); no validator on `[KeepCopy]` (thread 18); `adopt` is `protected`; an orphan copy per thrown candidate; `mw.kept` keyed by boxlabel only. Tests read central and staged through `keptOf(held.mw, box)`.

### 15. A whisper and a sidecar on every update

*Orchestrator, the Coach's ruling (2026-10-30), on #384's whisperless-dna row:* "Make it so
customer must supply a whisper and sidecar on every update. This situation will eventually
improve, but it's greatly simplifying". Label `whisper_required`.
Every update names both: `build(dna)` (the dna's whisper and sidecar), `edit(patch)` and `send`
(the patch's), `seal`. One without both refuses `bad_option` before anything is staged. What
the rule retires goes with it: carrying a sidecar or a whisper over from the record in hand
(`NoSidecarToCarry`, `NoWhisperToCarry`, the sparse-base paths in `makeStaged`), `reseal` and
`BoxEditOpts`, and the whisperless dna (the stub seal always takes a whisper). *YOLO:* the exposed
whisper (`box.whisper = …`) no longer stands in for one at an edit; the setter stays as the
Coach asked, documented as exposing only. A tombstone (`del`) is not an update. Tests restated
where they edit with a sidecar alone or a whisper alone. Worker `opus`; review `medium`. Depends
on 17 (cut from its tip; 12 and 15 both touch `box.ts`). Size: medium.


### 21. `TestableBox`, in place of `keptOf`

*Orchestrator, the Coach (2026-10-31), on #389's test-reading row:* "Does a TestableStorable /
TestableBox that offers `get _cheat_central()` and `get _cheat_staged()` solve the issue? I wish I
had better guidance to stop agents from picking names like KeptOf -- once I point to it do you see
that it's terrible?" Label `testable_box`.
In `tests/test-helpers/models-world.ts`, a `TestableBox extends Box` exposes the storable's
protected `central` and `staged` getters as `get _cheat_central()` and `get _cheat_staged()`;
`boxListingOf` and `fakeSealBoxListingOf` make it (the listing's `makeThing`). Every
`keptOf(held.mw, box).central` / `.staged` becomes `box._cheat_central` / `box._cheat_staged`;
`keptOf`, `mw.kept` and `KeptBoxListing` go. Tests about the cache compare the save
(`callsOf('save')`, `lastSaveOf`) with the cheat getters. No source change under `src/`. Name a
new helper for what it returns; no coined verbs. Worker `sonnet`; review `low`. Depends on 15 (cut
from its tip). Size: small (mechanical, wide).

### 13. The whisper, an object

*Orchestrator, the Coach's ruling (2026-10-30):* "for the new box only -- require that whisper,
like sidecar, be an object. Given the baseline difficulty of accessing it, asking the developer
to type an extra `.val` is not material. schedule a thread to do that." Label `whisper_object`.
The models' `Box` (`src/models/box.ts`, never the old `src/box.ts`) takes and gives its whisper
as a plain object (`box.whisper = { val: 'sk-…' }`), checked at the setter and at unseal as the
sidecar is; the seal serializes the object. `null` and `LOCKED` keep their meaning (thread 9's
setter). **Hands off:** cutting off access to the private value while locked (the Coach: "I will
have to look at it later"); the setter is documented as it is.
*Added (the Coach, 2026-10-31, on Closer Look's `Symbol.for('LOCKED')` flag):* "Probably better to
use the private symbol and make this a frozen singleton object that we swap in; also give Storable
a static method "isLockedFUBag" that is true for that bag." Sent to the live worker: `LOCKED`
becomes a frozen singleton branded by a module-private `Symbol` (never `Symbol.for`), and
`Storable.isLockedFUBag(value)` is true only for it; the setter forgets on `LOCKED` as on null. Worker `opus`; review `high` (the
whisper is secret material: no side door, CLAUDE.md). Depends on 21 (cut from its tip; 15 below it). Size: small to medium.

### 22. `settle` saves to the cache itself

*Orchestrator, the Coach (2026-10-31), on #389's keepCopy row:* "I'm fine with settle caching.
Have it talk right to the DeviceDB. Don't implement anything yet to read it back, unless you have
already. If the listing is also doing its own cache of the boxes themselves: - if they are doing
it naturally, not using the snapshot and not using some backdoor constructed for the purpose,
leave it. - if there are contraptions that exist only so that the listing can have a duplicate (or
anything else giving unreasonable access) please disclose. It's reasonable for the listing to
cache what it owns: the scopes (or scope paths) of its contents, and its own metadata; probably
facts about its world so it can be reconciled." Label `settle_saves`.
`Storable#settle` saves its own cacheable to the device cache (the listing's `Cache`, handed to the
storable at construction as the world and listing are), at every settle: edits, receives, `del`,
and construction, a revive included. `[MSX.KeepCopy]`, the listing's `#copies` and its
`settle(scope)` save go; the listing keeps `#things` and its snapshot. A save that refuses is bad
news (`tell`), never thrown into the verb that settled; `settle` does not await it. Reading back
is `hello`'s load, as now: nothing new. Tests about the cache assert on `callsOf('save')` and
`lastSaveOf`, now at every settle; restore the frozen-copy-after-edit assertion #402 lost. The
spec says the storable saves itself. Worker `opus`; review `medium`. Depends on 13 (cut from its
tip). Size: small to medium.

### 18. Validators at every entrypoint

*Orchestrator, the Coach (2026-10-31, in chat):* "would you have a thread put zod validators at
each entrypoint -- edit, send, seal, etc if they aren't already? In the case of edit and send
these should duckish-out (do you have that term in your vocab?) all the fields that are under our
control." Label `entry_checks`.
1. **Survey.** Every public method of the models' `Box`, `BoxListing`, `Storable` and `Listing`
   (`build`, `edit`, `send`, `seal`, `del`, `fetch`, `hydrate`, `hello`, the whisper and sidecar
   setters, and the rest): which already parse their arguments (`boxDna`, `MSX.sendOpts`,
   `MSX.fetchOpts`, …) and which take them unchecked. List it in the thread file.
2. **Checks.** Each unchecked entry validates its arguments through a check made in a `Checkers`
   call in `models-shapes.ts` (CLAUDE.md: never plain Zod for a module's validator), refusing
   `bad_option` and naming the field, as `boxDna` does. A private helper past a checked entry
   trusts it.
3. **Duckish for `edit` and `send`** (VOCABULARY.md, *duckish*): the caller gives the fields it
   owns (whisper, sidecar, and what else thread 15 requires); it may give or omit the fields the
   factory controls (scope, `vault_tok`, `revision_tok`, `revision_seq`, `am`, the times, the
   sealed fields), which must pass validation when given and are stripped. A scope field given
   that names another box refuses `bad_option`. Thread 15's whisper-and-sidecar rule becomes part
   of these checks where it fits; say so in the thread file.
4. **Argument checks first** (the Coach, 2026-10-31: "validate preconditions first of all, because
   those are always programmer mistakes. You don't want to have to create an unlocked scenario --
   which might lead to coincidental values. Point being: arg checks first"): every entry checks
   its arguments before any guard (lock, presence, hydrate); `build` parses its dna before its
   lock check (today it refuses `vault_locked` first), as `edit` already does.
5. *Orchestrator, from #390's and #403's reviews:* the sidecar is checked at `edit`'s entry (today a
   bad one refuses `bad_record` inside `stubSeal`, after hydrate); `edit(undefined)` refuses
   `bad_option`, not a TypeError from `namesBoth`; a malformed whisper refuses one kind at every
   entry (`build` says `bad_option`, the setter, `edit` and `send` `bad_whisper`: pick one, say
   which); `LOCKED` handed to `edit`/`send` gets a refusal that names it ("LOCKED is not a
   whisper: unseal or expose one first") rather than "val: required".
6. Tests: one per entry for a bad argument, and for `edit` and `send` a round-trip of
   `{ ...box.snapshot-or-record, whisper, sidecar }` with factory fields given and stripped.
Worker `opus`; review `medium`. Depends on 22 (cut from its tip; 15 and 13 below it reshape the
same entries). Size: medium.

### 23. The Coach's fingerpaints and Closer Look marks

*Orchestrator, the Coach (2026-10-31):* "I have edited a bunch of places in the base repo, and in
the closer look; so far ~ 60% of the entries are slop, but easy enough to unwind. The edits in my
base repo are fingerpaints -- sweep them into whatever cleanup thread, it should be obvious what I
intend." Label `coach_sweep`.
* **The fingerpaints:** `whiteboard/20261030-storable/coach-fingerpaints-20261031.patch`, the
  Coach's uncommitted edits in `/workspace/byok` against main at #390 (helpers.ts, models/box.ts,
  models-shapes.ts, storable.ts). Port their intent onto the line's tip (the code has moved since
  #390: #402-#404 and 18): `tattoo` and `tattooProp` exported from `src/helpers.ts`, the local
  copy gone; `#minted` renamed `#memoizedNextRevision`; `assign(record)` with one argument
  (`registered_at` moves at birth and over a tombstone: keep that behaviour, judged on the central
  held before the adopt); `lifePropsOf`/`revisionPropsOf` gone ("FIXME: just use a zod type!!!":
  take the props by a check's parse); `isTombstone` spelled `am === 'd' || am === 'x'`; `full`,
  `isFull`, `#isWhole`, `isWholeRecord`, `isTombstoneRecord` as the patch has them, with honest
  type guards; the `tell` constructor argument gone, a timer's refusal going through
  `this.listing.tellBadNews` (and the cache save's refusal the same way); the FIXMEs (makeStaged's
  second argument is a patch, named so; "this doc block is wth" on `settle`) acted on.
* **The Closer Look marks** (the tab, as the Coach left it when the thread is cut; re-read it
  then): so far `priorTok()` → `priorRevisionTok()`; `settle` calls `#cacheOnDevice` (thread 22's
  `#saveCopy`, renamed); `ensureReadyToSend` / `demandReadyToSend` restored on `Storable` ("more
  readable to have its own -- and it means the conditions are established from the start");
  doc blocks rewritten for the whisper getter and setter, `expose` (from the spec), `edit`,
  `demandReadyToUnsealWhisper` (the Coach's text: "throws unless unlocked with a full healthy
  record -- refuses 'absent_box', 'needs_fetch' or 'vault_locked'"; `needs_fetch` is no refusal
  kind today: say what `demandFull` refuses, and raise it) and `demandReadyToSeal` ("throws
  unless unlocked ('vault_locked')"). `namesBoth` → abstract `isFullPatch` went to thread 18.
* **More Closer Look marks (re-read at the cut):** "Bad-news plumbing ... no, just call
  listing.tellBadNews or some other method" (the `Tell` type and `#tell` handed through
  `makeThing` go with the constructor's `tell`); the cache revive's `cacheLoaded` / `cacheable`
  checks renamed `buildableRecords` / `buildableRecord` ("you've uncached them and then making
  them ready to build with"); `priorRevisionTok` also in the `Store` contract's parameter names
  and the listing's `fitsPriorTok` neighbours; `LOCKED` "change to FUBag as discussed" (it is a
  frozen bag since #403: name it so if the name still says symbol).
* **Rulings since (the Coach, 2026-10-31, in Resolved):** the `Cache.save` contract says saves are
  best effort and an adapter keeps call order, the last call winning ("Document the best-effort
  promise; they can call _.debounce or a join primitive"); where the code forces a fetch with a
  horizon of 0 (`hydrate`, a record in hand not whole), it uses `minRefreshMillis` = 50 ("we cannot
  refresh(0) as a matter of habit"); the props that follow the record (`revision_tok`,
  `revision_seq`, `written_at`, `registered_at`) become plain assignments to `declare`d fields set
  before the seal, `tattoo` kept only for the immutable scope and `vault_tok` (the Coach asked why
  tattoo, and why `configurable: false` doesn't fail on the second `defineProperty`: a
  non-configurable property stays writable, so its value may change).
Worker `opus`; review `medium`. Depends on 18 (cut from its tip). Size: medium.
*Review:* fixed (medium). Fixed: the `Cache` doc says to debounce `save` per thing, keyed by scope; `tellBadNews` and `MinRefreshMillis` docs say when, not who; guarantees.md's exposed-whisper line regained its verb; *send establishes its own guard first* seeds the store (it checked order on a send refused `'stale_write'`). Left: the 50 ms window after a newer sparse record (thread 24, `makeBarelyUntimely`); `Cacheable` against `buildableRecord` (a Coach row); revision props writable by a host, as before; `send` hydrates twice, harmless; `isTombstone` reads a missing `am` as alive, behind `oneof(amVals)`; `becomeNotifiable` not in STYLE.md's verbs. Ruled since: `'bad_option'` for a record not full, no `needs_fetch` (the Coach: "bad_option that's fine").

### 25. Life toks, and `makeStaged` makes the whole staged record

*Orchestrator, the Coach (2026-10-31), verbatim:* "ffs I just understood what you meant by stale
meta of. rip that out of the files I'll fix the caller. Can you have edit move the makeStaged
lines into makeStaged? Box and Vault need to add box_tok/vault_tok there as birthday gifts
(makeLifeTok to create it) next to registered_at (which can be set by either written_at or now).
Add a protected lifeTokPathOf: this says what life you are on (it's vault_tok for vault,
`vault_tok-box_tok` for box), #sameLife(record) will compare them -- replacing the naked vault_tok
comparison. This will defend against the "did another thing come along and replace this"
conundrum. If we're right, the registered_at and life tok won't change except at birthdays." And:
"I fingerpainted in storable for this." Label `life_tok`.
* **Fingerpaints:** `whiteboard/20261030-storable/coach-fingerpaints-20261031b.patch` is the whole
  of the Coach's uncommitted edits in `/workspace/byok`, against main at #390; what is new over
  `coach-fingerpaints-20261031.patch` (thread 23's) is only in `edit`: "FIXME move this to
  makeStaged. Makestaged in subclass shoule add box_tok / vault_tok", with `nextRevision`, `now`
  and `combined` commented out, and the moved-central refusal's meta built in place as
  `{ stored_revision: <central's revision props>, staged_revision: <staged's> }` where it called
  `this.listing.staleMetaOf`.
1. `staleMetaOf` goes: the abstract on `Listing` and both concrete ones, with their `as unknown as`
   casts. `edit`'s moved-central refusal builds its meta in place as the fingerpaint does (take the
   revision props by a check's parse or destructuring, not `revisionPropsOf`, which thread 23
   removed); fit `RefusalMeta` to it rather than cast.
2. The lines `edit` runs before `makeStaged` (the next revision, `now`, `combined`, the birthday
   `registered_at`, the `{ ...combined, ...nextRevision, registered_at, written_at: now, am: 'a' }`
   base) move into `makeStaged`, so `makeStaged` makes the whole staged record. `edit` keeps the
   guard, `ante`, the moved-central check and the reconcile. A base helper the two concrete
   `makeStaged`s share is fine; say where it lives.
3. **Birthday gifts.** At a birthday (the base a tombstone or the never-stored shim), `makeStaged`
   gives a fresh life tok made by a new `makeLifeTok()` (beside `randomId`; a life tok is a tok,
   VOCABULARY.md) and `registered_at` = the new record's `written_at`; otherwise both carry over
   from `combined`. Box gains a stored `box_tok` (in `boxSparse`, factory-controlled, stripped by
   `boxDna` like `vault_tok`); the box's draft (`BoxListing.draftOf`) gives one too. Vault's life
   tok is its `vault_tok`, which `VaultListing.draftOf` already mints (switch it to
   `makeLifeTok`).
4. **`lifeTokPathOf` and `#sameLife`.** A protected abstract `lifeTokPathOf(record)`: Vault's is
   `vault_tok`, Box's is `` `${vault_tok}-${box_tok}` ``. A private `#sameLife(record)` compares a
   record's path with the held central's, and replaces `reconcileCentral`'s naked
   `rcvd.vault_tok !== this.vault_tok` precheck.
*Orchestrator gloss:* the code today tattoos `vault_tok` immutably on the instance and throws
`unexpected_error` (`OtherVaultTok`) for a record under another; `Listing.#demandRecordOfVault`
checks it again at birth (the Coach: "meh, it's not in the way"; leave that one). Two points the
Coach's text leaves to the worker, YOLO calls recorded in the thread file and as open matters:
(a) where a received record of another life is legit: a box remade elsewhere (a newer record of
another `box_tok`, after a del) is a birthday, not an error, while a record of another life at the
same or an older seq, or under another `vault_tok`, is the "another thing came along" case; place
the rule as rows of the reconcile table where it can, since thread 24 makes that table tell the
whole story; (b) a vault's birthday through `edit` over a vault tombstone would mint a new
`vault_tok` while the instance's own is tattooed and every box's world names the old: build the
gift as directed for the box; for the vault, if it cannot follow without remaking the vault's
boxes (the plan's "Not yet: flushing and remaking every instance of a vault made anew"), keep the
vault's `vault_tok` over its own tombstone, and say so as an open matter. Stored shape: the models
are not exported, so `box_tok` binds nothing yet; the changeset is likely `--empty`; say so.
Worker `opus`; review `high` (a new stored field, and the precheck that decides which records a
thing takes). Depends on 23 (cut from its tip). Size: medium.

### 24. The receive table and the trigger's verdict

*Orchestrator, the Coach (2026-10-31), Closer Look marks:* on `receive`'s `delSpent`: "fix table.
is delSpent a camel when others are labels? try recreate instead"; on the trigger's
`notesOwnSuccess`: "yes please. Why is an ok tryFetch not yet a success?"; on `reconcileStaged`'s
'edit' row: "no if it's called patch it should be a patch. how did that happen? why is makeStaged
a thing when this is reconcile's job?" Label `receive_table`.
1. The `delSpent` decision moves into the reconcile tables as a labelled policy row (the Coach
   suggests the label `'recreate'`; take it unless it misnames the case, and say why), so the
   tables tell the whole story and `receive` adds no branch of its own.
2. The trigger's `notesOwnSuccess` mode, `#notedInLaunch` and `#unconfirmed` go: the launch
   (`tryFetch`) resolves to `receive`'s verdict (the record in hand whole and not behind), and the
   trigger counts a launch a success by that outcome, not by a side call to `noteSuccessNow`.
3. `reconcileStaged`'s `forms.patch` is renamed for what it is, the staged record `makeStaged` made
   and sealed; since thread 25, `makeStaged` makes it whole, under `nextRevision`, so the 'edit' row
   takes it as made.
4. *The Coach (2026-10-31), on the 50 ms window (#406's review: within `MinRefreshMillis` of a full
   fetch, a newer sparse record leaves `hydrate` skipping the fetch, and `unsealWhisper` refusing
   `'bad_option'`):* "ok, trigger.makeBarelyUntimely()". A newer record received that is not whole
   calls a new `Trigger#makeBarelyUntimely()`, so the next hydrate fetches; change the test that
   pins the window (*shares the last fetch with a hydrate of a sparse central within
   MinRefreshMillis*), and `demandReadyToUnsealWhisper`'s doc then holds.
5. *The Coach (2026-10-31), on `Listing.tellBadNews` public and unchecked:* "If you have to ask,
   Validate". It checks its argument at entry, by a `Checker`.
Worker `opus`; review `medium`. Depends on 25 (cut from its tip). Size: medium.

### 19. A rollback, thrown

*Orchestrator, the Coach (2026-10-31), on #388's stuck-device row:* "There's nothing we can do
except throw errors (and eventually, to give customers a way to hook into reconcile.) It's an
impossible situation unless it's by deliberate user action i.e. a backup. I think this is a
rollback_error -- lmk if I'm confused". Label `rollback_thrown`.
When storage answers a put or a del with `stale_write` carrying a row older than central
(`cmpRevisions`), or carrying nothing while central is held alive (the #388 review's purged row),
the listing throws `box_behind` to the put/del caller, and a background launch tells
`onBadNews`. Nothing is adopted and central is kept. *Ruled (the Coach, 2026-10-31):* "box_behind
matches the observation, and the error can name a likely cause -- this shouldn't happen unless the
data was modified or restored to an earlier point, and there's no way for us to decide among panic
(Hackers!), roll back (the data is presumably otherwise sound) or somehow apply the current state
as an edit to the rolled back data -- the customer can do so, we cannot". So: a new bad-news kind
`box_behind` in `refusalKindVals`, beside `vault_behind`, with its family in
`RefusalFamilyForKind` and an entry in the package README's *Errors* section; its message names
the likely cause and says the customer, not the device, chooses among those three. The kind list
is exported: the changeset says a host may now meet `box_behind`.
*Ruled too (the Coach, 2026-10-31), on #388's "carrying nothing":* "I think there's a missing
record refusal. If you want to be friendly, report the conflicting staged/stored/expected
revisions in meta". So the `Store` contract changes one cell: a put or del naming a `priorTok`
over no row refuses the kind's absent refusal (the listing's `absentRefusal`: `absent_box` for a
box), not `stale_write` carrying nothing; its `meta` carries the revision put, the revision
stored (none) and the `priorTok` expected. The fake follows; the spec table's
"`stale_write`, carrying nothing ❓" cell names it. A device holding central alive turns that
refusal into `box_behind` (above); one holding a tombstone or nothing keeps today's behaviour,
named in the thread file. The `StaleBoxMessage` mismatch on *Cleanup* goes with it.
*And (the Coach, 2026-10-31):* "Do our subscriptions limit to only their vault_tok? They should."
They don't today: `Store.watch(onNotice, fullFor)` names scopes, which carry no `vault_tok`, so
another vault's notice arrives and is refused `unexpected_error` as bad news. `Store.watch`
names the listing's `vault_tok` and storage pushes only that vault's records; the fake follows,
and a test shows another vault's change is never pushed. A record under another `vault_tok` that
arrives anyway is still refused at once ("it can only be the residue of failing to delete"). Survey the other
paths where an older or absent answer meets a live central (a fetch's `get`, a notice) and what
each does today; change none of them, list them in the thread file for the Coach. Worker `opus`;
review `medium`. Depends on 24 (cut from its tip). Size: small to medium.

### 20. A draft carried onto a tombstone

*Orchestrator, the Coach (2026-10-31), on another agent's issue 3 (a dna built over a deleted
box loses the dna):* "We must accept the new central value ... In the current code I believe you
can always seal and so the movement you recommend is possible. I suspect Vault is going to want
to do this. Do what we're doing for the ouch case and we'll probably end up throwing when it hits
this weird case and locks between the edit and the send." And on the 'ouch' row's carry, which
keeps a staged's sealed parts under a new revision though the seal binds the stamp: "leave the
broken behavior. one-line comment in reconcile that this will break a box edit. (we will lose the
ability to re-seal, as we won't know what the old sealed revision was) Document with a passing
failing test in loosened". Label `draft_carried`.
1. In `reconcileStaged`, a staged draft (staged over the never-stored shim: the `central` handed
   in has `revision_seq` `NeverStoredSeq`) that meets a tombstone (act `'gone'`) carries forward
   as `'ouch'` carries the staged, `{ ...staged, ...nextRevision }`. Only `'gone'`: a draft that
   meets a live record (`'adopt'`) is still dropped, since carrying it would put it over another
   device's box. The table in the doc block gains the row.
2. A one-line comment at the `'ouch'` row and the new row: the carry keeps sealed parts bound to
   the old revision, so it will break a box's seal once the real seal lands.
3. Tests: `build(dna)` over a scope whose stored tombstone is at seq 8, then `send`, lands the
   dna's whisper and sidecar at seq 9, both when `send`'s hydrate gets the tombstone and when
   the put meets it as `stale_write`. In `tests/loosened/loosened.test.ts`, a describe that passes
   on today's carry ('ouch' and the draft) and names what the real seal will break.
Worker `sonnet`; review `medium`. Depends on 19 (cut from its tip). Size: small.

### 6. What this model guarantees

> **6. What this model guarantees.** No code. Read `notes/guarantees.md` *The guarantees* and the README sections in *Read first*, then `tests/loosened/loosened.test.ts` and threads 2 through 5 and 8's thread files, and write `whiteboard/20261028-storable_base/guarantees-of-the-model.md`: a table, one row per guarantee or promise, columns `Guarantee | Old source | Model | Evidence`, where *Model* is `kept`, `changed`, `not yet` or `dropped` and *Evidence* names a test by file and title or a line of code. Every describe of the loosened file appears as `changed` or `dropped` with the Coach's decision left blank; every firm loosening appears as `changed` with the Coach's word as its evidence. Nothing about the seal beyond noting the rows that wait on it. Depends on 2, 3, 4, 5, 8. Size: small, `opus`.

*Orchestrator:* Label `model_guarantees`. Runs last, on the restacked line of every other thread,
so the loosened file and every thread file are in its tree. Reads 4a's and 4b's thread files for
"thread 4", and 7's too.
**Levels:** worker `opus`; review `none` (no code; the Coach reads the table).
**Depends on:** 2, 3, 4a, 4b, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24.
**Size:** small.

## Order

*Orchestrator (2026-10-30, resumed):* the line is main → #368 → #374 → 1 → 4a → 2 → 5 → 7 → 4b → 3, then 8, 9 and 10 in a chain on top (each touches `listing.ts`), then 14 (build seals: the Coach's blocker), then 11, 12, 16, 17, 15, 13 (the Coach's rulings of the evening: `listing.ts`, then `box.ts` three times; 13's whisper object rides 14's seal and 15's rule), then 21 (TestableBox) before 13, then 22 (settle saves to the cache), then 18 (validators at every entrypoint, the Coach's request of 2026-10-31), 23 (the Coach's fingerpaints), 24 (the receive table and the trigger's verdict) and 19 (a rollback, thrown), then 20 (a draft carried onto a tombstone), then 6; thread 16 (the store's versioned replace) runs right after 12. 4b's and 3's reworks build on the line; 8, 9, 10 after them.


Thread 1 alone. Once it files: 2, 3 and 4a. As each files: 4b (after 4a), 5, 7. Thread 8 once 3
and 4b have filed and are restacked into a line. Thread 6 last, on the whole line.

## For the Coach

* The brief's own *For the Coach* list is unchanged; threads pin those behaviours in the loosened
  file rather than settle any of them.
* Old *What a* / *What the* comments in `src/models/`: ruled, fix as you go (ground rule 2).
* **Bad news is later work** (the Coach, 2026-10-30): "very poorly thought out -- a build()
  doesn't allow it to be returned. #deliver should be handling a set of unhandleable errors, then
  someone is handling things like corrupt error." No thread designs it; thread 3 lists in its
  thread file every place bad news cannot reach anyone, as the inventory for that work.
