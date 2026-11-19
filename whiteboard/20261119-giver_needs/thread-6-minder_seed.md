# Thread 6: minder_seed (2026-11-19)

Branch `20261119-minder_seed`, PR [#765](https://github.com/mrflip/safebyok/pull/765), stacked on [#759](https://github.com/mrflip/safebyok/pull/759). Proved: `vitest tests/minding` green,
safebyok typecheck and lint clean; `pnpm justify` after the catch-up rebase (see the PR's
**Tests:** line).

The Coach's ruling (#757's open matter, "a child heard of before its parent's first listing"):
"seed the root box listing as bare wherever it is that the root box is seeded. have hello fetch
the listing if that's not a can of worms". A second ruling arrived mid-thread: a write's `world`
and `tracked` reach the cache through the vaultDB's watch, never the verb.

* **Built** (`packages/safebyok/src/minding/thing-minder.ts` unless named):
  * Commit `vault: a minder's tryWrite lands only the write's own record...`: `tryWrite` caches the
    record written or the refusal's `dbhas`, nothing else; `recordsOfWriteAnswer` is gone. Its doc
    block, the write invariant, the class doc, thread 4's changeset
    (`.changeset/20261119-minder_writes.md`) and the writes tests say so. A new test shows a
    tracked, stale main gate arriving from `MemoryVaultDB`'s watch alone.
  * Commit `vault: a minder caches the root box's listing bare from hello...`:
    * `hello` seeds the root box's listing `[]` with `updatedAt: BareListedAt` (0, TanStack's
      `dataUpdatedAt` for a query never fetched), before the watch starts. A `listing` event is
      told for it.
    * `isListingBareAt(scoped)`: a public reader, true while the cached listing's
      `dataUpdatedAt` is 0.
    * `#joinParentListing` keeps the listing's `dataUpdatedAt` on a join (a join is not a list),
      so a seeded listing stays bare through joins and invalidates, until a `list` sets it, even
      a list answering `[]`.
    * `setQueryDefaults([...rootBoxHead, '#'], { gcTime: Infinity })` in `#makeTSQ`: the root
      listing is never collected. `#setListingDefaults` gathers the per-key defaults the list
      and the seed both set.
    * Invariants rewritten: the first-list race is gone for the root box. What it lists depends
      only on which records arrived since `hello`, never on their order against its first list.
    * `QueryCacheOpts.gcTime`'s doc (`src/shapes/shapes-minder.ts`) names the root listing.
    * VOCABULARY.md: a *listing* row (minder's sense: labelpaths heard of, tombstones included,
      labelpath order; bare; minded and givable apply); *sparse* reworded so "listing" keeps one
      meaning; *car* says `carkind` spans all three `listen` events.
    * Tests: `thing-minder-cache` (seed, gcTime, an `isListingBareAt` describe),
      `thing-minder-listen` (the hello listing event), `thing-minder-listing-orders` (a list
      answered before the boxes were born, for a get, a write and a notice: 18 cases that fail
      with the seed off).

* **Decisions made**:
  * **Bareness rides on TanStack's `dataUpdatedAt`**, not a field of our own: 0 is TanStack's own
    "never fetched". Set aside: the `isInvalidated` mark (every join's `setQueryData` clears it);
    a separate bare-scope set (a field of our own, against the brief).
  * **A bare listing is visible**: `listingAt(root)` answers `[]`, or the boxes heard of, from
    `hello`. A caller tells bare from complete with `isListingBareAt`. Set aside: hiding a bare
    listing until listed (option B), which hides boxes the minder has in hand and needs a second
    path for joins; an `isBare` on `ListingEvent` (a listener can ask; kept the shape as is).
  * **`hello` fetches nothing** (the can of worms): a `list` before birth refuses `void`, so each
    `hello` before birth would report a refusal or need a special case; a list in flight across
    `goodbye`/`hello` would mark the new seed listed while the watch was off; and every listen and
    order test changes. The seed alone closes the race; the giver (M-later) can `list` when it
    wants a complete listing.
  * **gcTime Infinity for the root listing**: a collected seed loses its joins, and the race
    returns on the next list. The defaults sit on the key prefix ending `'#'` so that the per-key
    defaults each list sets (`'#','kids'`) merge over them rather than replace them.

* **Deviations**:
  * `listingAt(root)` answers from `hello` where it answered undefined, and `listen` tells a
    listing event at `hello`. Its contract ("the cached listing of `scoped`'s children, however
    old, or undefined for none") holds literally.
  * A complete listing's `dataUpdatedAt` no longer advances on a join: it is the time of the last
    list. Staleness under `staleTime` now counts from the list.
  * Edited thread 4's changeset for the `tryWrite` ruling, rather than a new one.

* **Discoveries**:
  * The watch covers what `tryWrite` dropped: `AdapterVaultDB` notifies each tracked Thing not
    'same' after every verb (unless `doNotifyTracked: false`); `MemoryVaultDB` notifies records
    written. The world's bank and gate are never notices of their own, but reach the cache when
    written or tracked; the minder ignores `notice.world`. No open matter needed.
  * Under `exactOptionalPropertyTypes`, `setQueryData(..., { updatedAt: maybe })` won't typecheck:
    read `getQueryState` first.
  * Only the root box's listing is seeded, so only it is ever bare.

* **For the Coach** (open matters, each with my recommendation):
  * **Bare listing visible**: built visible plus `isListingBareAt`; keep.
  * **ListingEvent carries no bareness**: listeners call `isListingBareAt`; keep until a listener
    needs it.
  * **Join keeps the listing's time**: accept; a join is not a fetch.
  * **hello fetch**: not built, for the reasons above; leave to the giver.
  * **Old "listing" senses**: VOCABULARY's "the bank's listing" and "enlist, listed, kept" rows
    still use the word for safebyok-big; reword when big's rows are retired.
  * **Cross-session list**: a list in flight across `goodbye`/`hello` lands in the new session;
    predates this thread; a row, not a fix.
