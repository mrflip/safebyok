# Thread 8: giver_feed (2026-11-20)

Branch `20261120-giver_feed`, PR #775, stacked on #773. Proved: `safebyok-react` 309/309, of them `tests/giver` 47; `safebyok` 1328 + 2 new key tests; typecheck and lint clean in both; `pnpm justify` green after the catch-up (safebyok 1330, safebyok-react 309, e2e 576).

* **Built**
  * **The Coach's hand edits, swept** (its own commit, crediting the Coach). The minder's key methods take a `Labelpathed`, which is now exported, and `subtreeQueryKey` becomes `childrenQueryKey`. Where the patch met thread 2, `'sok'` and the listener format were kept.
  * **`ThingMinder.queryKeyOf(scope)` / `bankQueryKeyOf(scope)`** (`packages/safebyok/src/minding/thing-minder.ts`) give a car's key and a bank's key prefix without a minder. The giver's `boxCarQueryKey` and `bankQueryKey` delegate to them, so the key grammar is spelled in one place. This is outside `giver/` (declared).
  * **`giver/shapes-giver.ts`**, new: `CarFields` (now with `agerank`), `GiverEvent`, `GiverBank`, `GiverDevice` and `BoxQueryOpts`, and `Checkers` in place of the handrolled Device check.
  * **`react-giver.ts`**:
    * Query defaults: `networkMode: 'always'`; `staleTime` 0 while `dbHasNewer(car)`, else Infinity; `structuralSharing` keeps the greater agerank, the prior car on a tie, and uses TanStack's `replaceEqualDeep` for anything that is not a car (TanStack also shares the *selected* value through it).
    * `useBoxRecord<SelT = fullest>(labelpath, opts)`: `select` picks `fullest` and a host's own replaces it.
    * `boxCarQueryOptions` gives the whole car with every default except select.
    * `useGating()` is new. `useBankSnapshot` reads `device.getSnapshot().bank`.
    * `forBank(banklabel)` refuses `bad_scope` for any banklabel other than the Device's.
    * The design note is pinned as a `//` comment over the defaults. The freeze note is in `makeReactGiver`'s doc block.
  * **`react-bridge.ts`**, `deliverEvent`:
    * Returns on `type === 'removed'`, on undefined data, and when no host entry exists.
    * A car that is not `bare` gets `setQueryData(event.queryKey, car, { updatedAt: event.state.dataUpdatedAt })`.
    * `dbHasNewer` → invalidate exact.
    * Catch-up on bridge start invalidates every entry of the bank that shows data (`cancelRefetch: false`), in place of peek plus key parsing.
  * **`minder-bank.ts`** passes the minder's box `ThingEvent`s through untranslated. `peekBoxCar`, `userid` and `banklabel` are gone from `GiverBank`.
* **Decisions made**
  * **Removal events leave the host's entry.** A removal is the minder's cache letting go (gc, goodbye), not news from the vaultDB. The host's cache keeps what the host's options say, and removing the entry under a mounted hook would flicker it back to pending. A bank object that ends still resets its entries, as before.
  * **The giver holds one Device, of one user and one bank.** `GiverDevice` takes the real Device's `userid`, `banklabel`, `getSnapshot` and `subscribe`, plus `ensureBank()` (no args) and `onBankStart`, which the Device does not have yet (startup is out of bounds). There is no `getServerSnapshot`: a constant `{ bank: null, gating: null }` serves the server.
  * **`PendingBank` is `stage: 'starting'`**, not the Coach's `'signed_out'`: a Device exists only for someone signed in.
  * **Catch-up by refetch, not peek.** The minder answers a timely car at once (the fake's `getBoxCar` copies that), so this costs no vaultDB read. It also means the bridge never parses keys.
  * **`carStaleTimeOf` reuses `dbHasNewer`** instead of spelling out `bhnd`/`bare` again.
  * **The Coach's TODO comments**, removed from the code and answered here:
    * "move to a separate file / use their checks": done, as `shapes-giver.ts`.
    * "make a checker and derive the type" (BoxRecordOpts): pushed back. These are TanStack's option types, and a checker over them would hand-copy React Query's surface. `BoxQueryOpts` is `Omit<UseQueryOptions, 'queryKey' | 'queryFn'>`.
    * "run a slop checker" and "have an agent look up urql's doc style": both are fan-outs, so they are held for approval. See *For the Coach*.
* **Deviations**
  * **A `bare` car is not copied.** It has no record to show, so `select` would give `undefined` with status `success`. It is refetched instead, as before.
  * **Loosened: the giver no longer follows sign-in.** The tests "fetches nothing while nobody is signed in" and "keeps each user's record under a key of its own" are gone. Signing out ends the Device, and startup is out of bounds.
* **Discoveries**
  * TanStack's `structuralSharing` runs on `select`'s output too: a comparator that sees only cars would freeze a selected value. That is why `isCar` duck-checks.
  * A mutation check confirms the comparator does work: with plain `replaceEqualDeep`, three tests fail, among them the real-minder order "fetch, bridge, notice".
  * Notes for tests:
    * TanStack v5 notifies through a `setTimeout(0)`, so a sync `act` does not flush a `setQueryData` re-render; use `waitFor`.
    * A `renderHook` result only re-renders for props it has already read (tracked props).
    * `prefetchQuery` is deprecated in the installed 5.107; use `client.query`.
  * Thread 7 (#774) drops `gating.lastRefusal` and makes `endCause` a VaultError. The giver passes both snapshots through unread, and the tests build gating snapshots without `lastRefusal` (cast), so the restack should be clean.
* **For the Coach**
  * **Fan-out held:** a documentarian pass over `safebyok-react`'s doc blocks (the "slop checker"), and an agent to study urql's doc style. Each needs your yes.
  * **"If they don't have one we'll make it"** (a QueryClient for hosts without React Query) is not built. Thread 9's demo can supply its own `QueryClientProvider`. Recommendation: a later thread, once a host without RQ exists.
  * **`initialData` from the minder's car** (dream-interface-2) is not built. The catch-up refetch covers a car the minder holds timely.
  * **Look-ahead for thread 9:** `Giver.useGating()`, `Giver.forBank(label).useBankSnapshot()` and `useBoxRecord(labelpath)`. The Device needs `ensureBank`/`onBankStart` (or a wrapper) before it can be handed to `makeReactGiver`; `minderDeviceOf` in `tests/test-helpers/minder-giver-world.ts` shows the shape.
