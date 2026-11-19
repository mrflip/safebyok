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
  - `{ carkind: 'invalidation', modelkind, labelpath, card: 'list', tags: 'all' }`: "card being (not yet, but later)
    'list', 'self', 'kids' (#, !, /); tags hold the string 'all' or later a list of labels." Only `card: 'list'` and
    `tags: 'all'` exist now.
* **The small list answer** is not for this sprint (the Coach): no proposal; thread 3 adds a TODO.md entry for it.
* **The write verb** is `tryWrite(ask)`, answering the vaultDB's `WriteThingAnswer` as it came, once every record it
  carries has landed (the Coach: "we want both eventually ... carry on with what goes with the grain"). A throwing verb
  comes later; the Coach is looking into how throwing bears on invalidation.
* **`invalidate`'s second argument is required** (the Coach: "exactly"): `invalidate(labelpath?, { list: 'all' })`.
