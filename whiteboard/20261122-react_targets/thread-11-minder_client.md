# Thread 11: minder_client (2026-11-22)

Branch `20261122-minder_client`, PR #TBD, stacked on #827. Proved: `pnpm --filter safebyok lint typecheck test` green (1415 tests before the new file's 13 and the device test, 31 files); safebyok-react-lean's 271 tests green; `pnpm justify` at the tip after the catch-up (the PR's **Tests:** line).

So the Provider can make the vault cache's client with the device, empty, and each signed-in user's minder attaches to it: TanStack binds a hook's observer to the QueryClient of its first render.

* **Built**:
  * **`ThingMinder.makeClient()`** (`thing-minder.ts`, [Construction]). A plain `TSQ.QueryClient` whose `QueryCache` is built with the cache-level `onSuccess`, as before; it now looks up the minder attached for the key's bank (`bankHashOf`: `hashKey` of the key's first three segments) and hands it the record, or does nothing for a bank with none. The attachments live in a module `WeakMap` beside the client (`LandersOfClient`: client to `Map<bankHash, Lander>`).
  * **`ThingMinder.isClient(val)`**: true for a client `makeClient` made. `make` and `Device.make` accept only those (`custom(...).optional()` in each's Checks, phrase `MinderClientExpected`): a plain QueryClient has no attachments, so its `onSuccess` would settle nothing.
  * **`MinderOpts.queryClient`** and **`DeviceOpts.queryClient`**, optional; none given, the minder makes its own with `makeClient`, so every existing caller is unchanged. Device passes it through to `ThingMinder.make`.
  * **`minder.queryClient`**, a getter: the client it caches in, for a `QueryClientProvider`.
  * **Attach at `hello`, detach at `goodbye`.** `hello` refuses `bad_record` (`bankMindedInClient`) while another minder of the same bank is attached to that client, then attaches, sets the query defaults, seeds the listing, watches. `goodbye` deletes the attachment, one line beside its `removeQueries` by prefix.
  * **Query defaults moved from the constructor to `hello`** (`#makeTSQ` became `#setQueryDefaults`).
  * Tests: `tests/minding/thing-minder/thing-minder-shared-client.test.ts` (13), and one in `tests/models/device.test.ts`. `fakeBankOf` in `world.ts` takes a scope, `TH.ThingBank` by default.
* **Exports**: no new export line anywhere. `ThingMinder` (with `makeClient`, `isClient`, `queryClient`) and `type MinderOpts` were already on `safebyok`'s front door (`src/index.ts`), which react-lean imports. `DeviceOpts` is on `safebyok/core`. Nothing on react-lean's public surface.
* **Decisions made**:
  * **Attach at hello, not make.** The header says a minder "caches only from `hello` until `goodbye`"; attaching across the same span keeps `onSuccess` settling only while it minds, and makes a second `hello` after `goodbye` on one client attach again with no new state.
  * **Defaults at hello.** Set at make, merely making a second minder of a bank would overwrite a live minder's `queryFn` closures under the same prefix. Before `hello` nothing builds a query (the reads refuse `disabled`; `at`, `isStaleAt`, `listingAt`, `isListingBareAt`, `invalidate` only find existing queries), and the defaults still precede `#seedListing`, which needs `gcTime: Infinity`.
  * **Refuse a second minder of a bank at hello.** Two minders of one bank on one client would share every query and each other's defaults: a broken state, reported, not accommodated. It throws only on a shared client, so no existing caller sees it.
  * **WeakMap beside a plain QueryClient**, over a QueryClient subclass (public attach/detach a host could call) or a `meta` on each query (a host's `meta` would override it). The client stays exactly what `QueryClientProvider` takes.
* **Deviations**: the module doc's first line, "... in a TanStack Query cache of its own.", now reads "... in a TanStack Query cache, its own or one it shares with minders of other banks." Not a header invariant.
* **Discoveries** (left alone, out of scope):
  * The class header's "`goodbye` empties its cache", and goodbye's "Stop minding, and empty the cache.", read true if "its cache" is its bank's entries; on a shared client the other banks' stay. Suggested words, not applied: "`goodbye` removes its bank's entries from the cache." / "Stop minding, and remove this bank's entries from the cache."
  * `goodbye` of a minder never started, while another of its bank minds on the same client, deletes that one's attachment and removes its entries (the existing removal by prefix). Endings are held.
  * Query defaults stay set after `goodbye`, closing over the minder that said it: TanStack has no call to remove defaults. A hook observing a minder key before `hello` builds a query with no defaults. For the React thread.
  * `DeviceOpts` on `safebyok/core` now names a TanStack type, where core's header says it has "no caching, so neither the ThingMinder nor TanStack Query". A type import only.
  * The predicate and phrase of the client check are written twice, in Device's Checks and the minder's.
* **For the Coach**: the `hello` refusal (a new throw from a call that never threw) and defaults at `hello`, above. Safety hatch: a non-null `!` on `LandersOfClient.get(this.#tsq)` in the constructor (the check ran first; the lint rule is off here).
