# The redistribution: VaultMinder and VaultTSQ replace the old minders

Drawn up 2026-11-24 by a read-only agent from the code at the tip of `20261124-world_stages` (#875), condensed and
corrected here. Nothing is built. Paths are under `packages/safebyok/` unless they say otherwise. An item that starts
"Scaffolding:" exists only until the thread it names.

The agent's addendum, which builds in the Coach's ruling on `stale_read`, is folded into section 6.1. One defect in
its `initialData` expression is corrected in section 4.

## 0. The decisions in one screen

1. **`VaultMinder`** is today's `SortedVaultDB`, renamed once the old classes are deleted. It holds the Things, sorts
   the feed, answers the raw vaultDB verbs and builds the asks. It gains `doGetOnce`, `doListOnce`, `putOnce`,
   `delOnce` and the four ask builders. It knows nothing of TanStack Query.
2. **`VaultTSQ`** is new, one per bank, and owns no QueryClient. It sets query defaults under the bank's key prefix,
   turns each `VaultEvent` into a tree call, makes the query options (a queryFn that calls `vaultMinder.doGetOnce`),
   has `getOnce` and `listOnce` (the front doors that read through the tree), and wraps mutationFns. It does no
   structural sharing of its own and has no `onSuccess`.
3. **The tree's value is read from the Thing, never from the answer.** The queryFn returns what the Thing holds after
   `doGetOnce` resolves: a live record, `null` for a tombstone or the shell, and it throws for a bare Thing (6.1). The
   Thing's agerank rule has already compared the answer with everything seen, so "return the more recent of the item
   and the answer" is done before TanStack sees a value, and an older answer can never overwrite the tree.
4. **An item entry holds the Thing's own frozen record** (`structuralSharing: false`), so
   `getQueryData(key) === thing.pickle()`. Listings keep TanStack's default sharing.
5. **Event to tree:** `item` full sets the record; `item` gone or void sets `null`; `item` soon does nothing; `aged`
   cold invalidates the item; `aged` bare resets it; `life` invalidates the parent's listing (resets it on a leap) and
   resets the Thing's own listing. Reset, not remove: see point 2 of section 2.
6. **A cold entry is stale by `staleTime`, not by a flag:** the item default is
   `staleTime: (query) => agekind === 'cold' ? 0 : Infinity`. That keeps today's hook rule and needs no
   re-invalidation after a get resolves (6.2).
7. **Two small Thing changes:** an `agekind` getter, and `citable` widened to the newest seen record's sparse fields.
8. Scaffolding: a private roots-only QueryClient in `Device` keeps the roots persister, the cached start and
   `maskedView().bankTSQ` working. It is never handed to a host. The LocalBridge thread removes it.

## 1. Build order

| # | Scope | Left red or as scaffolding | Main risk |
|---|---|---|---|
| **T1. VaultMinder's members** | On `SortedVaultDB` (not yet renamed): the ask builders, `doGetOnce`, `doListOnce`, `putOnce`, `delOnce`. On `Thing`: `agekind`, the widened `citable`. `Bank.put`, `Gate.#putGate` and the birth write through it. `Bank.rootBox` and `track` read the root Things. | The same 18 red. Scaffolding: the BankMinder still serves `useGate`, the persisters and sign-in's gets, and the old VaultMinder takes its asks from the `SortedVaultDB`; T3 removes both. | asks at sign-in while no bank is live; the `track` derivation |
| **T2. VaultTSQ, beside the old minders** | New `src/minding/vault-tsq.ts` and its tests. The chain table ported to drive a `SortedVaultDB` and a VaultTSQ on a QueryClient. `today` retired from the generator. | The chain table goes green. The seven old tests stay red. Nothing in `Device` or the hooks uses the VaultTSQ yet. | TanStack's edges: reset against remove, cancellation, `staleTime` as a function; each gets a test |
| **T3. The switch** | `Device` makes the VaultTSQ at sign-in on its QueryClient. `Vault` reads Things and the VaultTSQ, and takes `sealBox` and `unsealBox`. The roots scaffold. `safebyok-react-lean` moves onto the VaultTSQ and the world's Things. | The old classes unused but present. The seven still red. | `react-giver.test.tsx` and `record-hooks.test.tsx` lean on `device.minder`; the cached-start tests |
| **T4. Delete and rename** | Delete `minder.ts`, the old `vault-minder.ts`, `bank-minder.ts`, `newer-thing.ts`, `minder-keys.ts`, most of `shapes-minder.ts`, and their tests (the seven go with them). Rename `SortedVaultDB` to `VaultMinder`. `notes/wontfix.md` rows; VOCABULARY rows. | **The line is green here.** | wide but mechanical: front-door exports, stray doc references |

T4 can fold into T3 if T3's worker has room. They are apart so T3 is reviewed for behaviour and T4 for names.

## 2. For the Coach to rule on (what a host sees first)

1. **A newer life known only sparse leaves no data.** `aged` to bare resets the entry, so `useBox` shows
   `data: undefined` (pending, then a refetch), not the old life's record. Today `useBox` promises: "A record
   overtaken by a newer revision shows until the newer one arrives", and `notes/wontfix.md`: "`at()` answers the old
   life's record meanwhile". Recommended: accept, and rewrite both.
2. **`resetQueries` where the ruling said "removes".** A TanStack fact, checked in query-core 5.107.1:
   `removeQueries` destroys the query and tells the cache only, so an observer keeps showing the removed data until
   it re-renders for another reason. `resetQueries` returns the entry to its initial data (from the Thing, so nothing
   when bare) and refetches where it is observed. Recommended: reset.
3. **`useBoxList` relists on every change of a box's life** (a delete, a rebirth, a later life). Today it relists on
   "a box this device writes or hears of for the first time". The chain table wants it. Recommended: accept.
4. **What `getOnce` answers when its fetch is overtaken by a newer life and nobody observes the entry.** TanStack
   rejects the old promise with its own `CancelledError`. Recommended: catch nothing, let it through, and give it a
   row in `notes/wontfix.md`: a get in flight for milliseconds, overtaken by a rebirth. The alternative is one catch
   that turns it into `stale_read`.
5. **What a "leap" is.** The word is in the ruling ("remove is on a life leap") and nowhere in the code. Two readings:
   (a) the Thing has moved under a new life of its parent, so the parent's listing describes a dead life; (b) the
   Thing's own lifeseq moved by more than one step, so a death or birth was never seen. The agent built on (a).
6. **`queryCacheOpts`** (one field, `staleTime`, default an hour) has no job left: items are stale on evidence only.
   Recommended: delete it.
7. **Front-door exports deleted:** `Minder`, the old `VaultMinder`, `BankMinder`, `newerThingOf`, `DeadAt`, the
   `MinderEvent` family, `MinderChecks`, `device.minder`, `device.bankMinder`. A host that used `minder.listen`
   subscribes to the QueryClient's own cache. Recommended: delete.
8. **Names.** `getOnce` and `listOnce` on the VaultTSQ, `doGetOnce` and `doListOnce` on the VaultMinder, as the Coach
   proposed. Note that `doGetOnce` is then not captive: sign-in calls it directly for the roots, which never enter
   the tree. The alternative is a plain `getOnce` on each class.
9. **`citable` widened** from four fields (`revtok`, `revseq`, `am`, `lifepath`) to the newest seen record's Thing
   fields. Sealing the next revision of a cold or bare box needs `born_at`, `lifeseq`, `label` and the rest, and
   merging the held whole record with a newer citation would silently revert a sidecar written in between.
   Recommended: widen.
10. **`track` from each root's held record, not its `citable`.** With `citable`, a root known sparse-newer would be
    reported `'same'` and never sent whole. Recommended: the held record.
11. **`cancelRefetch: false` on every invalidate the writer makes.** With TanStack's default, a get whose own answer
    raised `aged` cold would cancel itself and fetch again. The cost: news that arrives while an observed item is
    being fetched is fetched again only at the observer's next mount, focus or reconnect. Recommended: `false`.
12. Scaffolding: **the roots persister**, kept by the private roots QueryClient until the LocalBridge. The
    alternative drops the `locked`-before-the-vaultDB-answers start until then.
13. Scaffolding: **`Device.make` keeps making the QueryClient** (`vaultTsqClient`, renamed `tsqClient`). The
    lifecycle thread may move it.

## 3. VaultMinder, member by member

**Kept as on `SortedVaultDB`:** `make(scope, { vaultDB, makeThing })`, `VaultDBSourcelabel`, `tryGetThing`,
`tryWriteThing`, `tryListThings`, `tryBirthBank` (each answer returned unchanged, its records told first),
`listen({ hear, onBadNews })`, `receive(event)`, `thingAt(scope)`, `sweep()`.

**Moves in: the ask builders** `makeGetAsk(draft)`, `makeListAsk(draft)`, `makePutAsk({ cited, record })`,
`makeDelAsk({ cited, record })`, from `Bank` and `Device`. `bank_lifetok` is the bank Thing's `lifetok` while that
Thing is live, else absent. `track` is built from the three roots' held records when all three Things exist, else
absent.

**New:**

* `doGetOnce(scoped): Promise<Thing>`: one `tryGetThing`; throws the answer's refusal; returns the Thing at the
  labelpath, whose events have already been told ("live in TSQ by the time it returns").
* `doListOnce(labelpath): Promise<Kids>`: one `tryListThings`; throws a refusal; damaged rows go to the listeners'
  `onBadNews`.
* `putOnce({ record, cited = thingAt(record).citable })`: one `tryWriteThing`; throws a refusal, whose `dbhas` has
  already been told. It serves boxes, `Bank.put` and `Gate.#putGate`.
* `delOnce({ record, cited })`: the same, with `makeDelAsk`.

**It does not** touch TanStack, keep listings, seal, retry, abort, persist, or cache anything beyond the Things.

**The Thing gains** `get agekind()` (`agekindOf`, exported from `src/storage/agerank.ts`) and the widened `citable`.
A Thing that is bare in a later life still holds the earlier life's record in `pickle()`, so every reader checks
`agekind` before it reads the record.

## 4. VaultTSQ, member by member

* **`make({ vaultMinder, queryClient, scope })`:** listens to the VaultMinder; sets query and mutation defaults under
  the bank's key (`networkMode: 'always'`, `retry: false`), which a host's own options override.
* **Keys** (static, the shapes of today): `itemKeyOf(scope)`, `listKeyOf(scope)`, `bankKeyOf(scope)`. The `'soon'`
  and `'dead'` kinds go.
* **Item defaults:** the queryFn of decision 3; `staleTime` of decision 6; `structuralSharing: false`.
* **Listing defaults:** a queryFn over `doListOnce`; `staleTime: Infinity`.
* **`itemQueryOptions(scope)`:** `{ queryKey, initialData, initialDataUpdatedAt }`, read from the Thing, so an entry
  TanStack collected is seeded again while its Thing lives on. **Corrected from the agent's report:** it wrote
  `initialData: () => treeValueOf(thing) ?? undefined`, which throws for a bare Thing and turns a tombstone's `null`
  into "no data". The seed is the record where live, `null` for a tombstone or the shell, and `undefined` where bare
  or where there is no Thing; only the queryFn throws.
* **`getOnce(scope, { staleTime })`** and **`listOnce(labelpath)`:** through `queryClient`.
* **`mutationOptionsOf(mutationFn)`.**
* **The writer** (synchronous, on each event; items only for boxes under the root box; bank, gate and root-box
  records never enter the tree, the root box's listing does):

| Event | query-core call |
|---|---|
| `item` full | `setQueryData(itemKey, val, { updatedAt: readAtOf(read_tc) })` |
| `item` gone or void | `setQueryData(itemKey, null, { updatedAt })` |
| `item` soon | nothing (an `aged` event follows) |
| `aged` cold | `invalidateQueries({ queryKey: itemKey, exact: true }, { cancelRefetch: false })` |
| `aged` bare | `resetQueries({ queryKey: itemKey, exact: true })` |
| `life` | the parent's listing: `invalidateQueries`, or `resetQueries` on a leap; its own listing: `resetQueries` |

* **`maskedRows()`**, moved from `Minder`.

## 5. Where every old member goes

| Old member | New home | Why |
|---|---|---|
| `Minder`'s constructor, its client, `setQueryDefaults` | `VaultTSQ.make` on the device's client | one tree |
| `persist` | `Device`, on its client; the roots by the scaffold | Scaffolding: until the LocalBridge |
| `hello`, `goodbye`, `#isReady`, `#unlisten` | deleted | the VaultTSQ is made at sign-in |
| `#hear`, `sendToTSQ`, `#landWorld`, `#landedByFetch`, `#settleLanded`, `#markBehinds` | the VaultTSQ's writer | the events carry the decisions |
| `at`, `soonAt`, `deadAt`, `isBehindAt` | `thingAt(...)`: `pickle()`, `citable`, `agekind` | the Thing holds them |
| `listingAt` | `getQueryData(listKeyOf)` | the library's |
| `tryAt`, `gotAnswerOf`, `isTimelyQuery`, `backgroundRefresh`, `isStaleAt` | deleted | no caller but tests and `Vault` |
| `get`, `tryGet`, `#fetchAt`, `#fetchRecord` | `VaultTSQ.getOnce` and `VaultMinder.doGetOnce` | |
| `list`, `tryList` | `listOnce` and `doListOnce` | |
| `invalidate` | deleted; a host calls `invalidateQueries` | the library's |
| `tryWrite`, `write` | `VaultMinder.putOnce`, `delOnce` | |
| `listen`, the `MinderEvent` types | deleted | the cache's own subscribe |
| the query-key makers | `VaultTSQ`'s static keys | |
| `maskedRows` | `VaultTSQ.maskedRows`; the roots' rows from the scaffold | |
| `newerThingOf`, `landedKidsOf`, `isKids` | deleted | the Thing compares |
| `BankMinder.worldAt` | `world.bank`, `world.gate`, the root box Thing | |
| `BankMinder.fetchWorld` | sign-in's two `doGetOnce` calls | Scaffolding: until the lifecycle thread |
| `BankMinder.subscribe` | `useGate` listens to the VaultMinder, at `gate` | |
| `BankMinder.tryBirthBank` | `VaultMinder.tryBirthBank` | already a pass-through |
| `Device.makeGetAsk`, `makeListAsk`, `MinderFriend`; `Bank.make*Ask`, `track`, `#roots` | the VaultMinder's builders; the root Things | |
| `Bank.rootBox` | `world.rootBox` | |
| `Bank.sealBox`, `unsealBox` and their `try` forms | `Vault` | "vault is the interface surface for boxes" |
| `Device.receiveRestored` | stays, fed by both restores | Scaffolding: until the LocalBridge |

## 6. The two open points

### 6.1 An answer of an earlier life than the Thing knows

The Coach: "if the db responds with [full_x,life=4,high=3,item=3] and the cache holds [cold,4,5,-1], the result is
full_x: it's a real value that's better than null. if the db responds with an earlier life, it is ignored." And on
what the get then hands TanStack: "throwing stale_read here is reasonable for the sideeffect. And it's super
improbable no matter what."

* **Same life, an older whole record:** taken, with no code. The prepared `4|5|3` sorts above `4|5|-1`; the Thing
  goes from bare to cold; `item` sets the data; the get resolves with the record.
* **An earlier life, and the Thing has a whole record or tombstone of its current life:** nothing changes; the get
  resolves with what the Thing has.
* **An earlier life, and the Thing is bare:** nothing changes; the queryFn throws `stale_read`, through the existing
  `Throwers.boxSoonestBare(labelpath)`. An observer shows `error` with no data; with `retry: false` nothing loops, the
  entry is fetched again only at an observer's next mount, focus or reconnect, and an `item` event clears the error.
  `getOnce` rejects with the same refusal and adds no catch of its own.

**The get already in flight when the newer sparse record arrives** is the library's to discard, checked in
query-core 5.107.1: `resetQueries` (our `aged` to bare) cancels the fetch silently, so its result never lands; where
the entry is observed the reset refetches, and the old promise answers with the new fetch.

**How the datastore can answer behind its own word:** a replicated backend without monotonic reads, a store restored
from backup, or a device database ringing a record its store has since lost. `MemoryVaultDB`, IndexedDB and Convex
cannot produce it.

**The mirror case** (an `item` sets data while a get is in flight, and the get then answers older): `setQueryData`
cancels nothing. The guard is decision 3: the queryFn returns what the Thing holds after `doGetOnce` resolves, never
the answer's record. It gets no test of its own: the chain table's mixed routes are the test.

### 6.2 A cold entry after a get answers with it

The tree shows the held whole record, not invalidated (the fetch's success clears that), and stale through the
`staleTime` function. A remount, focus or reconnect fetches again; nothing re-invalidates. Each later sparse sighting
of the newest revision in a new 65.536-second span is news again and invalidates again, a rate limit the agerank
already owns. The chain test asserts `query.isStale() === (thing.agekind !== 'here')` wherever there is data, and
never `isInvalidated`, which depends on the route.

## 7. `safebyok-react-lean` after the change

| Hook or call | Reads today | Reads then |
|---|---|---|
| `useBank`, `useStageChange`, the form verbs, `lock`, `dismissUnlock`, `useStrengthVerdict` | the device's snapshot, `bank.gate` | unchanged |
| `useBox`, `boxQuery`, `useQueryOptions` | `recordQueryDefaults`, the old minder's keys and queryFn | `VaultTSQ.itemKeyOf`, `itemQueryOptions`; `skipToken` until up, as now |
| `useBoxList`, `keys.*` | the old minder's list key | `VaultTSQ.listKeyOf`, the same key shapes |
| `useGate` | `bankMinder.worldAt()?.gate`, `bankMinder.subscribe` | `world.gate?.pickle()`, subscribed through the VaultMinder at `gate` |
| `withLockableWhisper` | `vault.minder.get`, `vault.bank.isUnlocked` | `vault.getOnce`, `vault.world.isUnlocked` |
| `useDraft`'s citation | `vault.minder.deadAt(scope)` or a shell | `vault.thingAt(labelpath)?.pickle()` or a shell |
| `putBoxMutationOptions` | inline options | `vaultTSQ.mutationOptionsOf` |
| the giver's `Provider`, `queryClient()` | `device.vaultTsqClient` | `device.tsqClient` |

Every hook answers as today except in points 1, 3 and 4 of section 2 and the cases of section 6.1.

## 8. The chain table's port (T2)

* **Drives** a `SortedVaultDB` over a `MemoryVaultDB` and a VaultTSQ on a fresh `QueryClient`: `'f'` by the watch;
  `'g'` for a whole record by `vaultTSQ.getOnce`; `'g'` for a soon by `vaultTSQ.listOnce('box')`.
* **Reads** the Thing at the box's scope and the tree's entry: `item` from the entry's data; `dead` from the Thing's
  tombstone where the data is `null`; `soon` from the Thing's `citable` where its tag is not here; `isListingStale`
  from the listing's entry; `isRefused` from whether `getOnce` rejected; and the staleness check of 6.2 at every end.
* **In the test file:** `today`, `todayBy`, `todayOf` and their sanity check go; each start is seeded against
  `wanted`. The eight `bare+soon <- ..., older` rows leave `isRefused` unstated, so nothing in the table contradicts
  6.1; the ported test asserts for them only that the cache ends at `wanted`.
* **The generator** (`whiteboard/20261123-minder_matrix/tablegen/`): `gen.py` loses its `today` machinery;
  `cycle.sh` and `dumptail.ts.txt` are deleted. A rerun must reproduce `wanted` byte for byte.
* **No test of a rare overlap beyond the table's own rows.** For the eight rows of 6.1 by a get, the ported test
  asserts: the Thing is still bare, its `citable` is the soon, the tree has no entry, the listing is not marked, and
  the get's `stale_read` is recorded without failing the step.
* **The seven old tests** go with their files in T4. Three promises carry over to the VaultTSQ's tests: the record a
  `putOnce` wrote is in the tree before it resolves; a refused put's stored record is in the tree before the refusal
  is thrown (the opposite of today's "changes no item itself for a refused write"); and the same revision seen in a
  later span sets the data again with its `read_tc`'s time.

## 9. What a host sees change, with today's promise

1. A newer life known only sparse leaves no data (point 1 of section 2).
2. A get refuses `stale_read` only where an earlier-life answer meets a bare Thing. Today, in `minder.ts`: "A get
   answered with a revision older than the newest cached when it began refuses `stale_read`, and changes nothing."
3. An older whole record of a bare soon's own life now shows, where the get refused.
4. `useBoxList` relists on every change of a box's life (point 3 of section 2).
5. A deleted box's tombstone is no longer a cache entry of its own. `Vault.tryDelBoxOnce` today: "The box's item is
   then null, and its dead record has the tombstone." Then: the Thing holds the tombstone and the tree holds `null`.
6. The exports and getters of point 7 of section 2 are gone.
7. `queryCacheOpts` is gone, if ruled so.

## 10. Rulings that bear on this design (the Coach, 2026-11-24, on the open-questions list)

* **The tree can be the customer's own QueryClient:** "I think it can". So the VaultTSQ takes whatever QueryClient it
  is handed and sets defaults only under the bank's key. For T3: `Device.make` accepts a host's `queryClient`; any
  persister on that client must dehydrate only entries under our key.
* **A deleted box, in the listing:** "if you mean TSQ: follow the standard vernacular... If you mean listing object
  surgery ahead of a reply coming back: moving the item from lives to gones is reasonable". The vernacular: after a
  delete, a list no longer shows the item (it is invalidated, and often filtered ahead of the refetch). So on a `life`
  event that is a death, the writer moves the box from the parent listing's `items` to its `gones` and invalidates the
  listing; `useBoxList` lists the live boxes. Today's doc, "A deleted box stays listed, and its `useBox` answers
  null", is rewritten. The item's own entry holds `null`, by the earlier ruling that the tree holds null or full.
* **`banktok`:** "call it banktok, put on ask, answer and event". The lease stamp's `bank_lifetok`, bound into every
  ctx in `proving.ts` and `lease.ts`, keeps its name.
* **`signin`,** no capital I: `Device.signin(userid)`, `#doSignin`, `world.signin(...)`. The words "bring-up" and
  "brought up" leave the code and docs.
* **`pickle()`** stays the way to the frozen record; no `record` getter. **`listen`** stays the device database's
  word too. **`sidecar`** stays hidden from a box's spread ("there will be a different bag for small visible data").
* The three host-visible changes of #874 and the two of #875 are accepted. The GraphQL changeset stays empty.

## 11. Rulings on section 2 (the Coach, 2026-11-24)

* **The tree's object:** "make sure the thing is returning the stable frozen object from the Answer it `receive`d".
  As built: the `SortedVaultDB` clones nothing, `Thing.adopt` freezes the very record the answer carried, and the tree
  entry is that object. Two things for T1 to settle and test: the freeze is shallow today (a box's `sidecar` is not
  frozen); and a repeat of the same revision in a later span is news, which today swaps in an equal record of a new
  identity. The Thing keeps the object it holds where the revision is the same, so the tree's entry does not change
  identity for equal content.
* **Point 8, names:** "ok getOnce on each; make sure you are naming and choosing correctly between foo and tryFoo for
  those. Usually you need to chain tryFoo's up the line because you need the full answer object. Do not wrap a long
  function body in outcomeOf where a try/catch is the plain answer." So on the VaultMinder the body is `tryGetOnce`,
  `tryListOnce`, `tryPutOnce`, `tryDelOnce`, each answering the vaultDB's whole answer, and `getOnce`, `listOnce`,
  `putOnce`, `delOnce` throw what the answer refused. On the VaultTSQ, `getOnce` and `listOnce` go through the
  QueryClient, which throws by nature; a `try` form there is a plain try/catch, only where a caller needs it.
* **Point 9, `citable` widened:** "lgtm".
* **Point 11, `cancelRefetch: false`:** "ok".
* **Point 10, `track`:** "high_roots". Not yet clear whether that is the field's name, the choice of the newest
  revision seen over the held record, or both; asked. T1 builds from the held record and keeps the name `track`
  until answered.
* **Point 5, a leap:** "if a box goes from life 2 to bare life 4, the TSQ item should be as for a ¿void invalidated?
  record". So a leap is the box's own life moving on to one known only sparse. What the item entry then shows is
  still open between no data (reset, as designed) and `null` marked invalid (as for a void); recommended: no data.
* **Point 4:** the Coach asked who cancels. TanStack does: the writer's `resetQueries`, which the bare rule calls
  anyway, cancels the entry's in-flight fetch as a side effect. Nothing of ours detects anything.
* Unanswered: points 1, 2, 3, 6, 7.

## 12. More rulings on section 2 (the Coach, 2026-11-24)

* **Point 4, the overtaken `getOnce`:** "I'm loath to override errors of TSQ to our helpful guess." So TanStack's
  `CancelledError` goes through untouched, with a row in `notes/wontfix.md`. The `cancelRefetch` flag does not bear on
  it: that flag governs an invalidate's refetch, and it is the reset, which always cancels, that ends the fetch.
* **Point 5, a leap:** "my vote: live box exists and we lack its content", and "if leap isn't different I don't mean
  to impute it is". So a newer life known only sparse leaves the item with no data, by reset, and a leap is no
  separate case anywhere.
* **Point 10:** the ask's `track` becomes `known_roots`, built from the held whole records: "we want to communicate
  the last full revision and life seen so we can get a newer". In T1.
* **Freezing:** "The whole thing should be deep-frozen on receipt by AdapterVaultDB." `deepFreeze` from `es-toolkit`,
  already a dependency. In T1.
* **Points 1, 2, 3, 6, 7:** point 3, "yes, if there's something added or deleted the list has changed"; "the rest of
  the 'not yet' are lgtm": reset where the ruling said removes, the old minders leave the front door, and
  `queryCacheOpts` goes.
* **How a listing is kept.** A listing is the vaultDB's answer to a list, kept in the tree and nowhere else: not in
  the device database, not in the minder. A list answer replaces it whole. A child's `life` event invalidates it
  (`cancelRefetch: false`), and the Thing's own listing is reset. `useBoxList` shows the answer's live children.
  Nothing else writes a listing: no surgery ahead of a reply, and nothing derived from the Things.

Built so far: #876 (`signin`, `banktok`). T1 is thread 11, `20261124-minder_members`.
