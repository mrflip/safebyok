# Thread 3: minder_listings (2026-11-19)

Branch `20261119-minder_listings`, PR #TBD, stacked on #756. Proved: `safebyok` lint, typecheck and `vitest run` (1099 pass); `safebyok-react` typecheck and `vitest run` (301 pass).

* **Built**
  * `ThingMinder.listingAt(scope)` (`packages/safebyok/src/minding/thing-minder.ts`, Reading): the cached listing of a Thing's children, read synchronously, as `at` reads a car. It holds labelpaths, tombstones included, in code-unit order, frozen. It is undefined until the Thing is first listed.
  * `list` sets the listing (`#sendListingToTSQ`) to the union of what it had and what the list answers, then lands each record in its car, all in one `notifyManager.batch`. It still answers labelpaths.
  * `#joinParentListing(record)` is **the one place a landing feeds its parent's listing**. `#sendToTSQ` calls it, so a notice and a list's records go through it, and thread 4's write answer will too. `#doGet` calls it on the car it answers, because TanStack lands a get's record through the queryFn, never through `#sendToTSQ`. It adds only where a listing is cached and lacks the labelpath. Otherwise its updater answers undefined, and TanStack makes no change and tells no event.
  * `#minderEventOf` has a listing branch (key ends `'kids'`). It tells `{ carkind: 'listing', modelkind, labelpaths, tag: 'kids', of: { parentpath } }`, and `labelpaths` is the cached array itself.
  * Four invariants for listings in ThingMinder's `## Invariants` block. The earlier invariants are unchanged.
  * Tests (`tests/minding/thing-minder.test.ts`):
    * `ThingMinder.listingAt`: 11 cases.
    * Three `listen` cases for listing events.
    * Section `Listings in any order`: all 6 orders of a list, a get and a notice, each run twice. In the first run, the list sees all three boxes. In the second, the list's answer was snapshotted before the get's box and the notice's box were born. Every order ends with the same listing.
    * The `list` listener case now expects the listing event first.
  * `TODO.md`: the listings row now keeps only the small list answer, with the Coach's sketch, marked as not for this sprint.

* **Decisions made**
  * **Per-listing options come from `setQueryDefaults` at the listing's own key.** It is set as `list` first caches the listing: `{ queryFn: skipToken, structuralSharing: stableListingOf, staleTime: host's }`. `setQueryData` takes no query options. No key prefix covers every listing and no car, so the cars' prefix defaults (car merge, car fetch) would otherwise apply. Defaults reach every caller through `defaultQueryOptions`, including thread 5's invalidation and any observer. Under `skipToken`, TanStack never fetches a listing, and invalidating one only marks it stale. `stableListingOf` is `replaceEqualDeep`, then frozen, so the array keeps its identity until a labelpath joins.
  * **A list adds, never replaces.** That is what makes membership the same for every order: a list answered before a box was born must not drop a box a notice already added. Membership only grows. A labelpath that a later list does not answer stays (tested).
  * **A list always sets its listing**, so that it clears invalidation and freshens `dataUpdatedAt`. So it tells a listing event even when nothing changed; the array keeps its identity.
  * **`modelkind` on a listing event is the parent's, which is every child's.** Mixed kinds cannot arise today, for three reasons:
    * The classifier's `isChildLabelpath` admits only children of the parent's modelkind.
    * A labelpath starts with its parent's.
    * A root's parent `''` cannot be listed (`minderLabelpath` refuses it).
  * **The root box's listing falls under the host's gcTime** (pinned by a test). A listing holds only labelpaths, and the next list restores it. The root car is pinned for another reason: a get of an absent box needs the root's life for its shell. The default gcTime is Infinity anyway.
  * **A shell joins no listing** (it is stored nowhere). **A tombstone joins and stays.**
  * **Parent life changes:** the listing keeps the earlier life's children beside the new life's, as the code leaves it. This is stated in the invariants, and nothing of M5 is built.

* **Deviations**
  * **`ListingEvent.labelpaths` is now `readonly Labelpath[] | undefined`.** It is undefined once the listing is removed (by goodbye, or by gc), as `ThingEvent.car` is. The ruled shape had no removal case. It is reported as an open matter.
  * **One `eslint-disable-line unicorn/prefer-simple-sort-comparator`** in `listingOf`. The rule suggests `one - other`, which is wrong for strings. `localeCompare` is not code-unit order, and es-toolkit's `sortBy` is typed for objects only.

* **Approaches set aside**
  * Replacing the listing on each list: order-dependent (see above).
  * Joining a parent's listing from a QueryCache subscription that watches car updates: indirect, and it would run inside TanStack's notify.
  * One global `structuralSharing` that dispatches on the data's shape: it would put car and listing logic in one function.
  * A key prefix for listings alone: it would need a key change that thread 1 settled differently (`TODO.md`, "A query key whose subtree is one prefix").

* **Discoveries**
  * **First-list race:** a record that lands while its parent has no listing cached joins none. That includes a notice that lands while the first list is in flight but after its snapshot. Such a child is missing until the next list, or the child's next landing. It is stated as an invariant ("the parent's next list lists it"), and nothing fixes it.
  * **Query defaults cannot be removed in TanStack.** One entry stays per parent ever listed (today the root box and the main gate), until the QueryClient goes.
  * **For thread 4:** land a write's answer through `#sendToTSQ`, and it joins its parent's listing. The `ListingOrders` comment says where a write step joins the order tests.
  * **For thread 5:** once a listing is collected, landings no longer grow it. A listing event with `labelpaths: undefined` is the cue to mark the givable listing stale, so that an observed one refetches through `list`. Within one list's batch, the listing event comes before its cars' events.

* **For the Coach**
  * Is the first-list race acceptable as documented, or should it be a `notes/wontfix.md` entry, which needs your ruling?
  * Do you accept the `labelpaths | undefined` widening?
