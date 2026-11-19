# giver_needs: progress

What the threads have taught, newer than the plan wherever they disagree. Workers look things up here; the orchestrator
writes it.

## Where things stand (2026-11-19)

* The line stands on #751 (`20261119-giver_order`), which adds `peekBoxCar`, the bridge's catch-up, and the minder's
  `## Invariants` heading.
* Today's query key is `['safebyok', userid, banklabel, ...labelpath.split('/'), '.']`; the root box's query defaults
  (`gcTime: Infinity`) are set on its key.
* `listen` hands a `TSQGotAnswer` per car event (success, error, removed). The giver's `listenBoxCars` reads only
  `answer.ask.labelpath` and `answer.car`.
* The bank makes write asks (`Bank.makePutAsk`, `makeDelAsk`); `Bank.tryPutBox` and `tryDelBox` call `tryWriteThing`
  directly, around the minder.

## Thread 1, minder_keys (#753)

*Orchestrator:*
* Keys are public methods on `ThingMinder`: `queryKey(scope)` (a car, ending `'!'`), `listingQueryKey(scope)`
  (`'#', 'kids'`), `subtreeQueryKey(scope)` (ending `'/'`: every car and listing under the Thing, neither of its own),
  over a private `#keyHeadOf`. Nothing caches a listing yet.
* `#scopeOfQueryKey` reads a car key and a listing key alike (labels up to the first `'!'` or `'#'`); tell them apart
  by the mark.
* The listings under a labelpath, for thread 5: `subtreeQueryKey(scope)` plus the Thing's own `listingQueryKey(scope)`.
* `BoxLabelpath` lives in `shapes/primitives.ts` beside `Labelpath`, exported from `safebyok`; its guard is
  `Labelpath.isBox` (beside `Labelpath.isOfModelkind`); `ThingAt` reads `BoxLabelpath`; the giver uses both.
* **Main moved under the sprint** (#740, #747–#750: namespaces, classes, exports): `shellOf` is `Shell.of`,
  `isVoidSentinel` is `Thing.isVoidSentinel`, `Checkers` comes from `safebyok`. #751 is rebased onto it. Names in the
  plan's glosses predate it; trust the code.
* From its review, for thread 3: `#scopeOfQueryKey`'s callers (the default `queryFn`, `listen`) treat every query as a
  car, and a listing key decodes to its parent's scope. Listing queries must stay out of those paths, or take a branch
  of their own there. The root box's `gcTime: Infinity` sits on its car key alone, so its listing falls under the
  host's `gcTime` (a test pins it): thread 3 decides whether that is right.
* A fresh worktree needs `pnpm --filter safebyok-big build` before the `safebyok` tests resolve
  `safebyok-big/internals`.

## Thread 2, minder_events (#756)

*Orchestrator:*
* `MinderEvent = ThingEvent | ListingEvent | InvalidationEvent` in `shapes/shapes-minder.ts`, exported from `safebyok`
  (names before the Coach: the plan's `*Car` names fought VOCABULARY.md). `ThingEvent<KindT>` is split by kind, so
  `modelkind: 'box'` types `car` as `BoxCar | undefined`.
* `listen(listener: (event: MinderEvent) => void)`; one private dispatcher, `#minderEventOf`, filters with
  `isUsefulTSQEvent` and reads the key's last segment: `'!'` gives a thing event, anything else undefined. Thread 3
  adds the `'#'` branch; thread 5 widens `isUsefulTSQEvent` for `invalidate` and adds its branch.
* The giver's `listenBoxCars` reads `carkind` and `modelkind === 'box'`, no cast.
* A fresh worktree needs `pnpm --filter safebyok-big build`, then `pnpm --filter safebyok build`, before the
  safebyok-react tests resolve.

## Thread 3, minder_listings (#757)

*Orchestrator:*
* `listingAt(scope)` reads a cached listing synchronously; `list` adds what it answers to the listing and never drops
  a labelpath; `#joinParentListing` is the one place a landing feeds its parent's listing (only where one is cached),
  called from `#sendToTSQ` and from the end of `#doGet` (a get's record lands through the queryFn).
* A listing is a plain TanStack query whose options ride `setQueryDefaults` on its own key, set when `list` first
  caches it: `queryFn: skipToken` (never fetched), structural sharing `replaceEqualDeep` then freeze, the host's
  `staleTime` and `gcTime` (the root box's listing too). Invalidating it only marks it stale.
* `#minderEventOf` has the `'#'` branch; `ListingEvent.labelpaths` is the cached array itself, and undefined once the
  listing is removed (before the Coach). A list always tells a listing event, before its cars' events in the batch.
* A listing's `modelkind` is the parent's, which is every child's: mixed kinds cannot arise today.
* Once a listing is collected, nothing grows it until the next `list`; a child landing before its parent's first
  listing joins none (before the Coach as the first-list race).
* Order tests: `ListingOrders` in `thing-minder.test.ts`, all 6 orders of a list, a get and a notice, twice; its
  comment says where thread 4 adds a write step.

## Thread 4, minder_writes (#758)

*Orchestrator:*
* `tryWrite(ask: WriteAsk): Promise<WriteThingAnswer>`, in a `Writing` section, never throws for what it checks: it
  answers the vaultDB's answer as it came, after landing `val` or a refusal's `dbhas`, the bank and main gate in
  `world`, and each `tracked` Thing not `'same'` (beyond M3's list; before the Coach), in one batch via `#sendToTSQ`.
  Not minding refuses `disabled`, a scope outside the bank `bad_record`, both without asking. A broken adapter's
  rejection propagates, as in `list`.
* A birth joins its parent's listing; a delete leaves the car `gone` and its tombstone listed.
* After a `stale_write`, `at(scope).newest` is the record the vaultDB reported, a full car.
* `QuietVaultDB` (test class): `MemoryVaultDB`'s watch can deliver a write's notice before its answer lands.
* `ListingOrders` now runs all 24 orders of list, get, write and notice.
* Thread 3's three narrating doc blocks were reworded here (b55e239b8).

## Thread 5, ahead (*Orchestrator:*)

* First commit: split `thing-minder.test.ts` (1,484 lines) into `tests/minding/thing-minder/`, a pure move.

* TanStack's `invalidateQueries` calls `query.invalidate()` on each match, which dispatches `{ type: 'invalidate' }`
  only if `!state.isInvalidated`; the cache tells `{ type: 'updated', query, action: { type: 'invalidate' } }`, one per
  query, synchronously. Data stays; `isInvalidated` turns true; the next `setQueryData` clears it with a `success`
  event. It then refetches active matches: pass `refetchType: 'none'`. (query-core 5.107.1, `queryClient.js`,
  `query.js`.)
* **The invalidation event is ruled again** (the Coach, 2026-11-19): one per query invalidated,
  `{ carkind: 'invalidation', modelkind, labelpath, card: 'list', tag: 'kids' }`, `labelpath` the listing's parent.
  Later, not built: for `card: 'get'` the tag is the label, for self it is `'full'`. Names are `tag` and `tags`, never
  `labels` ("they may not be constrained to the tight string formal label requires"). Thread 5 changes thread 2's
  `InvalidationEvent` (`tags: 'all'` → `tag: 'kids'`). The ask stays `invalidate(labelpath?, { list: 'all' })`.

## Rulings

* **Scope** (the Coach, 2026-11-19): Part 1 as planned, five threads on origin/main plus #751. "Don't do bulk
  deletion which has a whole bags of wormses in it and is not needed." Corrected the same day ("I overspake"):
  deleting a box, a write of its tombstone, is in, tests too; deleting a parent (the root box) and cascading it, with
  all the machinery that entails, is out.
* **listen's events** (the Coach, 2026-11-19), a tagged union on `carkind`:
  - `{ carkind: 'thing', modelkind, labelpath, car }`: `car` is the cached car itself, identity kept; undefined when
    the car is removed. `listen` no longer carries `act`, `isTimely`, `lastErr` (`tryAt` still does).
  - `{ carkind: 'listing', modelkind, labelpaths, tag: 'kids', of: { parentpath } }`: "Chosen to not restrict listings
    to always be child listings." `of` is an object, `{ parentpath: <the parent's labelpath> }` (the Coach
    confirmed). Their bluesky, direction only: `{ carkind: 'listing', tag: 'livekids_ci', of: { parentpath:
    'box/anthropic', tombstones: false, sidecar: { stage: { eq: 'ci' } } } }`: `tag` names the listing, `of` says what
    it selects. Only `tag: 'kids'` and `of: { parentpath }` are built.
  - The invalidation event: superseded, see *Thread 5, ahead* (one per query, `tag: 'kids'`).
* **The small list answer** is not for this sprint (the Coach): no proposal; thread 3 adds a TODO.md entry for it.
* **The write verb** is `tryWrite(ask)`, answering the vaultDB's `WriteThingAnswer` as it came, once every record it
  carries has landed (the Coach: "we want both eventually ... carry on with what goes with the grain"). A throwing verb
  comes later; the Coach is looking into how throwing bears on invalidation.
* **`invalidate`'s second argument is required** (the Coach: "exactly"): `invalidate(labelpath?, { list: 'all' })`.
* **Batch of 2026-11-19, late** (the Coach): `carkind` kept as ruled ("ok"), with a VOCABULARY *car* line; event type
  names kept ("ok"); `labelpaths` undefined on removal kept ("ok"); a VOCABULARY *listing* row (took the Rec); the
  first-list race: "seed the root box listing as bare wherever it is that the root box is seeded. have hello fetch the
  listing if that's not a can of worms" (thread 6). `tracked` landing: explained (the vaultDB's write acts on one
  subject and hands `world` and `tracked` back; `tryWrite` delivers them); back with the Coach.
* **`tryWrite` lands only its record** (the Coach, 2026-11-19): "it's supposed to not happen in the verb but rather in
  vaultDB -- sending them out as watch notices. the minder just pays attention to the record." The minder's `tryWrite`
  lands `val` or a refusal's `dbhas`, never `world` or `tracked` (reverses thread 4's addition and M3's world line);
  done in thread 6, which also reports whether the vaultDB's watch sends those out.
