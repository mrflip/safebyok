# giver_needs: sprint plan (2026-11-19)

* **Issued by:** the Coach, `/sprint` with "Would you please execute
  whiteboard/20261116-react_backwards/giver_needs.md. It's a bit shambolic, so ask questions /turbochat".
* **Mode:** normal.
* **Default levels:** review `medium`; worker `thread-worker` (its own model and effort); reviewer `thread-reviewer`
  (`sonnet`); style pass `style-reviewer` (`sonnet`). Up to 3 threads at once.
* **Sprint doc:** https://claude.ai/artifact/9wf4Ryn23X4M3jppvH77yP (doc 486aba46-e2f8-4d69-9ee8-4fdd8166fcee; Open Matters tab c4a2702e-8b87 (bookmark rev 1650), body ecf3fd4c-02c4, State enum c52d912d-4d90; Cleanup body 132c11d2-980a; Progress body 250e3266-4db9; Resolved body c12d7106-6d17).
* **Status:** threads 1–5 filed (#753, #756, #757, #758, #759, drafts); thread 6 building. The restack onto main waits on #751 (still an open draft on GitHub).

The source is `whiteboard/20261116-react_backwards/giver_needs.md`, snapshotted onto this branch from the base checkout
on 2026-11-19 with `dream-hooks.ts.md` and the Coach's edits to `internals.md`. This sprint is its **Part 1, the minder**:
M1, M2, M3, M4, M6, M7. M5 is marked "not this sprint", and Part 2 "not yet".

## Read first

* `whiteboard/20261116-react_backwards/giver_needs.md`, the thread's own section (quoted in each handoff).
* The class doc block of `ThingMinder` (`packages/safebyok/src/minding/thing-minder.ts`), its `## Invariants` above all.
* VOCABULARY.md: *car*, *fullest*, *newest*, *minded*, *givable*.
* `packages/safebyok-react/tests/giver/minder-giver.test.tsx`: how an invariant is stated across every order of arrival.
* `whiteboard/20261116-react_backwards/internals.md`, by section, only where a thread's gloss names one (F5, F6).

## Ground rules

* **Scope is ruled** (the Coach, 2026-11-19): Part 1 as planned, on origin/main plus #751. Deleting a box: yes,
  as a write of its tombstone. Deleting a parent (the root box) and cascading it, with all the machinery that entails:
  no. No subtree drop, no forgetting a gone parent's children, nothing of M5. (This corrects the Coach's earlier "no
  delete verb or delete tests through the minder": "I overspake.")
* **Stacked on #751** (`20261119-giver_order`, draft, green). Every thread stacks on the one before, in one line.
* **Every invariant in the class doc block holds** after each thread; a new behaviour states its invariant there, and an
  order test shows it across every order of arrival.
* **TanStack does the work it was built for** (the file's header comment): listings are queries, invalidation is
  TanStack's, events are the cache's own. No new concurrency machinery, no abort controllers, no retries, no
  optimistic updates.
* **giver_needs.md supersedes internals.md** where they differ (the Coach, in giver_needs.md).
* The new `safebyok` is private: changing `listen`'s answer, or adding a minder verb, needs no shim. Say in the PR what
  the giver sees.

## Threads

Reordered from giver_needs.md: M6 (the tagged union) runs second, before listings, so that each later thread adds its
own event to the union rather than reworking `listen` twice; M7 rides with M1.

### 1. minder_keys: M1, a query key whose subtree is one prefix; M7, a box's labelpath, typed

> ### M1. A query key whose subtree is one prefix
>
> Interleave the labelpath's segments with `'/'`, and end the key with `'!'` for the Thing's own car or `'#'` for its
> listing:
>
> ```
> ['safebyok', userid, banklabel, 'box', '!']                          the root box's car
> ['safebyok', userid, banklabel, 'box', '#', 'kids']                  its children's listing
> ['safebyok', userid, banklabel, 'box', '/', 'openai', '!']           a box's car
> ['safebyok', userid, banklabel, 'box', '/', 'openai', '/']           the prefix of everything under that box
> ```
>
> No label can be `'!'`, `'/'` or `'#'`: a label is lowercase. The root box's `gcTime: Infinity` default still matches
> its car alone. `#scopeOfQueryKey` reads the new grammar.
>
> *Done when:* the minder's tests pass unchanged, and a test shows a subtree prefix matching every key under a Thing and
> neither of the Thing's own.
>
> ### M7. A box's labelpath, typed
>
> Export `BoxLabelpath` (`'box' | \`box/${string}\``) and its guard from the core, so the giver stops declaring its own
> (`packages/safebyok-react/src/giver/minder-bank.ts`). Its key and its car type (`CarAt`) agree with it.
>
> (this may not be needed with recent changes to add modelkind)

*Gloss.* Touches `queryKey`, `#scopeOfQueryKey` and the root box's query defaults in `thing-minder.ts`; the giver's
`minder-bank.ts`; the core's exports. Today's key is already one segment per label, ending `'.'`; M1 interleaves `'/'`,
swaps `'.'` for `'!'`, and gives the listing key (`'#', 'kids'`) a builder for thread 3 to use. For M7 the worker
checks whether modelkind already gives the giver what it needs; if so, it says so and drops the export. **Depends on:**
#751. **Look-ahead:** thread 3 builds listings on the `'#'` key and thread 5 invalidates by prefix, so the key builders
take the shape both need (a car key, a listing key, a subtree prefix). **Size:** small. **Levels:** worker `sonnet`,
review `low`.

*Review:* fixed three style points (a blank line, `rootKeys` → `queryKeys`, a two-clause test title); no significant
findings. Left, as look-ahead: listing keys must stay out of the car-only paths of `#scopeOfQueryKey`'s callers
(thread 3); the root's listing is not under the root car's `gcTime: Infinity` (thread 3 decides); `subtreeQueryKey`
excludes the Thing's own keys (thread 5). Filing met a conflict when #751 was rebased onto the namespaces main; a fresh
worker resolved it: `BoxLabelpath` is in `shapes/primitives.ts`, its guard `Labelpath.isBox`.

### 2. minder_events: M6, what `listen` tells, as a tagged union

> ### M6. What `listen` tells, as a tagged union
>
> `listen` hands a ThingCar's answer today, with no message for a cache invalidation. With listings and invalidation it tells of three
> events: a ThingCar, a ListingCar, a InvalidationCar.
> Make the event a tagged union:
> { carkind: 'thing'         modelkind labelpath    newest fullest }
> { carkind: 'invalidation'  modelkind labelpath    card:'list' labels:'all' }
> { carkind: 'listing'       modelkind labelpaths[] }
>
> *Tags*, so that the giver's `listenBoxCars` and a listing's bridge read it without guessing from missing fields.
>
> *Done when:* the giver's `giverBankOfMinder` reads the tag, and its tests pass.

*Gloss.* Touches `listen`, `isUsefulTSQEvent` and `#answerOfTSQ`'s use in it, `shapes-minder.ts`, and the giver's
`giverBankOfMinder`. This thread builds the union and its `thing` member; threads 3 and 5 add `listing` and
`invalidation` as they make them. The member's exact fields wait on *Open Matters* (the shape of the thing event; the
listing and invalidation fields). **Depends on:** thread 1. **Size:** small to medium. **Levels:** defaults.

*Review:* fixed one doc slip (`car` is undefined where none is cached, a refused first get included, not only once
removed), with a test; no significant findings. Dropped as not defects: `lastErr` gone (the ruling), the dispatcher's
order and its one cast, the giver's `modelkind === 'box'`. Left: what `ListingEvent.modelkind` means for a mixed
listing (thread 3); `card` and `tags` are not in VOCABULARY.md (the Coach's names).

### 3. minder_listings: M2, the labelpaths of a Thing's children

> ### M2. Listings: the labelpaths of a Thing's children
>
> A listing is a query at the parent's `#` key, whose value is the labelpaths of the children the minder has heard of,
> tombstones included, in labelpath order. Structural sharing keeps its identity until its membership changes.
>
> * **Fed from every source.** A list sets it. A get, a write's answer and a watch notice each add the Thing's labelpath
>   to its parent's listing, where the minder has one. Membership only grows within the parent's life, so any order of
>   arrival gives the same listing.
> * **Never a sparse record.** A row reads its child's car (its newest); a second copy in the listing could disagree.
> * **Read synchronously**, as `at` reads a car: the listing the minder has, or undefined for none.
> * **`list` keeps its contract**: it answers the labelpaths, and lands each record in its car as today.
> * **The vaultDB's list answer can be made small** (the Coach): the parent's scope and life once, then for each child
>   its label, revseq, revtok, lifeseq and `written_at`. Propose the shape to the Coach before building it; it changes
>   the vaultDB contract and every adapter.
>
> *Done when:* order tests show a listing's membership the same for every order of a list, a get, a write and a notice;
> a box born on another device joins its parent's listing by the watch alone.

*Gloss.* Touches the minder's reading section (a synchronous listing read beside `at`), `list`, `#sendToTSQ` (each
landing adds to the parent's listing), the `listing` member of the union, and order tests. "A write's answer" arrives
with thread 4; this thread exposes the one place a landing feeds the listing, so thread 4 calls it. The small list
answer is **not built here**: it waits on *Open Matters*. internals.md F6 is the older form of this. **Depends on:**
thread 2. **Look-ahead:** thread 4's birth joins the listing through the same landing; thread 5 invalidates these
queries. **Size:** medium. **Levels:** defaults.

*Review:* fixed two (`stableListingOf` an arrow const, as a callback; `listingAt` tested with all three foreign
scopes); no significant findings. Confirmed per-key `setQueryDefaults` is TanStack's tool, the order tests, and no
listing key in the car paths. Left: three doc blocks narrating the body (`#doGet`, `#sendToTSQ`, `list`), handed to
thread 4; a VOCABULARY.md *listing* row (before the Coach); query defaults never removed (accepted, *Your calls*).

### 4. minder_writes: M3, the answer lands before the write resolves

> ### M3. Writes: the answer lands before the write resolves
>
> The minder writes, as well as reads. It takes a whole write ask, already
> sealed by the bank, sends it to the vaultDB's `tryWriteThing`, lands every record the answer carries in the cache
> through the merge, and only then answers.
>
> * Every record an answer carries lands: the stored record, a refusal's `dbhas` (a `stale_write` reports the newer
>   record, so the car's newest is what the next write must cite), and the bank and main gate in its `world`.
> * A birth adds to the parent's listing (M2). No delete verb, and no test of a delete through the minder: deletes are
>   out of scope (the Coach, 2026-11-19).
> * Nothing of the record enters the cache before the answer: no optimistic update.
> * Listeners hear the new car synchronously, inside the merge, before the write's promise resolves (TanStack calls cache
>   listeners at once, even inside `notifyManager.batch`). So the giver's entry shows the new record by the time a
>   host's `await` returns.
>
> *Done when:* a test shows a listener told of the new car before the write resolves; a `stale_write` leaves the car's
> newest at the record the vaultDB reported; the watch's later notice of the same write changes nothing.

*Gloss.* Touches the minder (a new write verb), `MinderFriend` only if it must, and order tests. The bank already makes
the write ask (`Bank.makePutAsk`, sealed by `sealBox`); `Bank.tryPutBox` and `tryDelBox` write around the minder today
and stay as they are. *Orchestrator:* the Coach corrected the quoted "No delete verb" (2026-11-19, "I overspake"): a
box's delete, a write of its tombstone, is in, with its tests; deleting a parent and cascading it is out. The verb's name and answer wait on *Open Matters*. **Depends on:**
thread 3. **Look-ahead:** Part 2's `putBoxOnce` and `delBox` write through this verb. **Size:** medium. **Levels:**
defaults.

*Review:* fixed three (two refusal-test titles named `bad_record`, `tryWrite`'s doc block narrating, the write
invariant now "While the minder is minding"; a delete-test title). Dropped: `loggableAskOf` cannot throw; a world or
tracked record cannot displace a newer car (`bestCarOf`); a broken adapter's rejection propagates (as `list`).
Checked and kept: `tracked` landing (before the Coach), `QuietVaultDB`.

### 5. minder_invalidate: M4, invalidate listings, and tell of it

> ### M4. Invalidate listings, and tell of it
>
> `invalidate(labelpath?, { list: 'all' })` marks the listings under a labelpath (or every listing) stale, fetches nothing, and `listen`
> tells of each. TanStack fires one `updated` event with action `invalidate` per query, synchronously, and only the
> first time a query is invalidated; `isUsefulTSQEvent` passes it on. The second arg may only take the value `{ list: 'all' }`
>
> The giver's side, for context: the bridge invalidates the givable listing, React Query refetches it where it is
> observed, the list paints a changed box `behind`, and the bridge has that box fetched again where it is shown. The
> minder invalidates listings only, never cars
>
> *Done when:* a test shows `invalidate` asking the vaultDB nothing, telling a listener of each listing, and a later
> `list` replacing what was invalid.

*Gloss.* Touches the minder (`invalidate`), `isUsefulTSQEvent`, the `invalidation` member of the union. Selecting "the
listings under a labelpath" uses thread 1's subtree prefix plus the Thing's own listing. **Depends on:** thread 4 (only
for the line; its code stands on threads 1–3). **Size:** small. **Levels:** worker `sonnet`, review `low`.

*Review (thread 5):* fixed two (a table's alignment; two-clause test titles split, and `invalidate`'s doc block now
says the mark clears when a record joins the listing too). The test split moves the same 129 titles unchanged. Left:
a shared `isListingKey` (the next thread touching key marks); `shapes-minder.ts` alignment.

### 6. minder_seed: the root box's listing seeded bare; VOCABULARY's *listing* and `carkind`

> seed the root box listing as bare wherever it is that the root box is seeded. have hello  fetch the listing if that's
> not a can of worms

(the Coach, 2026-11-19, on Open Matters' "A child heard of before its parent's first listing", #757); and, taking the
Recs: a VOCABULARY.md *listing* row for the minder's sense, *minded* and *givable* applying to it, *sparse*'s use of
"listing" reworded; a line in *car* saying `carkind` spans all three events (#756).

*Gloss.* Touches the minder where the root box's car and query defaults are set up (`#makeTSQ`, `hello`), the listing
code thread 3 built (`#joinParentListing`, `list`, `listingAt`), the first-list-race invariant in the class doc block,
and VOCABULARY.md. "Bare" is the car's word for "known incomplete; the vaultDB has more": a seeded root listing joins
every child that lands, and reads as incomplete until a `list` sets it. The worker designs how a listing says so with
TanStack's grain (its invalid mark is one candidate) and reports. `hello` fetching the root listing is new: until now
the minder fetched nothing itself; the worker judges whether it is "a can of worms" (`hello` is synchronous; a refused
list) and reports either way. **Depends on:** thread 5. **Size:** small to medium. **Levels:** defaults.

## For the Coach

The questions are rows in *Open Matters* of the sprint doc. Thread 1 needs none of them; threads 2–5 wait on the rows
tagged with their number.
