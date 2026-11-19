# Thread 2: minder_events (2026-11-19)

Branch `20261119-minder_events`, PR #TBD, stacked on #753. Proved: `safebyok` typecheck, lint and `vitest run` (1073 pass); `safebyok-react` typecheck, lint and `vitest run` (301 pass). `pnpm justify` after the catch-up rebase: pending.

* **Built**
  * `packages/safebyok/src/shapes/shapes-minder.ts`, section *What a listener is told*: `MinderEvent = ThingEvent | ListingEvent | InvalidationEvent`, told apart by `carkind`, in the Coach's ruled shapes. `ThingEvent<KindT extends Thingkind = Thingkind>` distributes over the kinds, so `modelkind: 'box'` narrows `car` to `BoxCar | undefined` (`RecordOfKind`). `ListingEvent` is `{ carkind: 'listing', modelkind, labelpaths, tag: 'kids', of: { parentpath } }`; `InvalidationEvent` is `{ carkind: 'invalidation', modelkind, labelpath, card: 'list', tags: 'all' }`. All four exported from `safebyok` (`src/index.ts`).
  * `ThingMinder.listen(listener: (event: MinderEvent) => void)` (`src/minding/thing-minder.ts`). The dispatch is one private method, `#minderEventOf(tsqEvent)`, in *TSQ Helpers*: `isUsefulTSQEvent` filters, then the key's last segment decides: `'!'` gives a `thing` event whose `car` is the query's `state.data` (undefined on `removed`). Any other key (a thread-3 listing, `'#', 'kids'`) answers undefined, so it never reaches the car path.
  * The giver's `listenBoxCars` (`safebyok-react/src/giver/minder-bank.ts`) passes over every event but `carkind: 'thing'` with `modelkind: 'box'` and a car, and hands `event.car` on with no cast (the old `as BoxCar` is gone).
  * Tests: `tests/minding/thing-minder.test.ts` "ThingMinder.listen" rewritten for the event (shape, car identity after a no-op notice, void and gone cars, a refused get carrying the cached car, removal telling no car, a typing test); the list test reads the new events. `safebyok-react/tests/giver/minder-giver.test.tsx`: `listenBoxCars` tells box cars only, not a gate's or a removed one.
  * Empty changeset `.changeset/20261119-minder_events.md`, with what a caller of `listen` sees.
* **Decisions made**
  * **Names**: `MinderEvent`, `ThingEvent`, `ListingEvent`, `InvalidationEvent`, after the `carkind` values. The plan's `ThingCar`/`ListingCar`/`InvalidationCar` fight VOCABULARY.md: `ThingCar` is already the cached value itself (the event carries one), a listing is not a car, and an invalidation is no cache value at all. "Event" matches TanStack's word for what the cache tells.
  * The car comes from the event's own query (`state.data`), not by looking the key up again: `removed` is told explicitly as undefined, since a removed query keeps its last state.
  * The giver reads `modelkind`, not `Labelpath.isBox(labelpath)`: the tag is what narrows the car's type, which drops the cast.
  * `isUsefulTSQEvent` and `#scopeOfQueryKey` unchanged; thread 5 widens the first for `invalidate`, thread 3 adds a `'#'` branch to `#minderEventOf`.
* **Deviations**: none from the rulings. The thing event drops `ask`, `act`, `val`, `ok`, `refreshedAt`, `isFetching` too (the ruling named `act`, `isTimely`, `lastErr`); `tryAt` still answers all of them.
* **Discoveries**
  * For thread 3: `ListingEvent.modelkind` is documented as "the modelkind of the Things listed"; a listing of the roots (parent `''`) lists mixed kinds, so decide there what it means. `of` grows by fields and `tag` by literals (the Coach's direction), nothing more is typed for that.
  * A fresh worktree needs `pnpm --filter safebyok build` (after `safebyok-big`) before `safebyok-react`'s vitest resolves `safebyok`.
