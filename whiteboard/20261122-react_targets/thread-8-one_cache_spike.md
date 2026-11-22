# Thread 8: one_cache_spike (2026-11-22)

Branch `20261122-one_cache_spike`, throwaway: no PR, no changeset, no docs. Cut from `20261122-unlock_urgent`
(`9f0b0f591`, #821). Proved: `pnpm justify` green (react-lean 269 tests, safebyok 1399, e2e 576, both lean demos).

The question: can the React hooks observe the ThingMinder's own QueryClient through TanStack's bindings, so the
bridge that copied records into the host's QueryClient goes? **Yes, for a hook mounted once a user is signed in.
No, for one mounted while nobody is**: see *Discoveries*, first item.

* **Built**
  * The door: `minderQueryClientOf(minder)` in `thing-minder.ts` (a static-block friend reading `#tsq`), exported on a
    new entry `safebyok/internals` (`src/internals.ts`, tsdown entry, `package.json` exports and typesVersions). It hands
    over the whole QueryClient, read and write. About 15 lines. The only change in `src/minding/`.
  * `react-giver.tsx`: every record hook and factory passes `clientOf(device)`: the minder's client, or an idle
    `QueryClient` the giver makes while no device is shown. With the bank up there is no `queryFn` on the hook, so the
    minder's default queryFn runs, and its cache's `onSuccess` lands the record. `useGate` selects through `gateShownOf`.
    `useBoxList` uses `skipToken`, and an effect lists through `minder.tryList` when the listing is bare or marked, and on
    each `invalidate` event of the listing.
  * `refetchBehinds(minder)`, started in `ensureDevice` where `bridgeMinder` was: on a soon's `success` or an item's
    `invalidate` event it refetches the item if a hook observes it (`type: 'active'`). Synchronous, inside the cache's notify.
  * New host-facing API, which the factories need: `bankGiver.queryClient()` and `BoxQueries.client`.
  * Gone: `react-bridge.ts`, its tests, `GiverEvent`, `GiverMount.client`, `getBoxListing`/`getBoxShown`/`getGateShown`.
  * Tests: `tests/giver/one-cache.test.tsx` (11: first render, watched put, list-told revision, refused get, listing
    growth and re-list, gate passkey, four orderings); signed-out-then-sign-in tests rewritten as characterizations.
* **Decisions made**
  * The staleTime function `isBehind() ? 0 : Infinity` stays, as ruled, now on the minder's item while observed. Its
    `0` arm looks inert (a behind item is already invalidated, so stale); its `Infinity` arm replaces the minder's own 1h.
  * The listing is not fetched by a queryFn on the minder's client: the cache's `onSuccess` would treat a listing as a
    record. Hence the effect.
* **Discoveries**
  * **A hook mounted signed out keeps the idle client.** `useBaseQuery` makes its observer once, with the first render's
    client, but takes `defaultQueryOptions` from each render's client. After sign-in such a `useBox` fetches once into the
    idle cache (with the minder's queryFn, bypassing its `onSuccess`) and never shows a newer revision; `useBoxList` shows
    nothing. Ways out, none built: key the Provider's children by device; let the giver own one client the minder
    caches in (a minder change, and held); or require record hooks to mount only once signed in.
  * TanStack reports `isStale` false for any `skipToken` query, so a listing's staleness can be heard only from the minder.
  * A host's hook options (`retry`, `initialData`, `structuralSharing`, `staleTime`...) now configure the minder's own
    query while observed. A refused get shows as the hook's error.
  * `@tanstack/query-core`: one copy (5.107.1) for react-lean and for knockknock; safebyok takes it as a peer.
* **For the Coach**: the client switch above, and whether `queryClient()` / `BoxQueries.client` are API a host
  should have. The guides (out of scope) still show `useQuery(factory)` without our client.
