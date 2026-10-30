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
* **Status:** resumed 2026-10-30; filed through #381 (thread 8). Thread 9 building; then 10, then 6.

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
Tests beside each. Worker `sonnet`; review `medium`. Depends on 9 (cut from its tip: both touch
`listing.ts`). Size: small to medium.

### 6. What this model guarantees

> **6. What this model guarantees.** No code. Read `notes/guarantees.md` *The guarantees* and the README sections in *Read first*, then `tests/loosened/loosened.test.ts` and threads 2 through 5 and 8's thread files, and write `whiteboard/20261028-storable_base/guarantees-of-the-model.md`: a table, one row per guarantee or promise, columns `Guarantee | Old source | Model | Evidence`, where *Model* is `kept`, `changed`, `not yet` or `dropped` and *Evidence* names a test by file and title or a line of code. Every describe of the loosened file appears as `changed` or `dropped` with the Coach's decision left blank; every firm loosening appears as `changed` with the Coach's word as its evidence. Nothing about the seal beyond noting the rows that wait on it. Depends on 2, 3, 4, 5, 8. Size: small, `opus`.

*Orchestrator:* Label `model_guarantees`. Runs last, on the restacked line of every other thread,
so the loosened file and every thread file are in its tree. Reads 4a's and 4b's thread files for
"thread 4", and 7's too.
**Levels:** worker `opus`; review `none` (no code; the Coach reads the table).
**Depends on:** 2, 3, 4a, 4b, 5, 7, 8, 9, 10.
**Size:** small.

## Order

*Orchestrator (2026-10-30, resumed):* the line is main → #368 → #374 → 1 → 4a → 2 → 5 → 7 → 4b → 3, then 8, 9 and 10 in a chain on top (each touches `listing.ts`), then 6. 4b's and 3's reworks build on the line; 8, 9, 10 after them.


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
