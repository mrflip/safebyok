# Thread 1: one_minder (2026-11-18)

Branch `20261118-one_minder`, cut from the local `20261113-crypt_plan` at 74e78a44e; not pushed, no PR (the
handoff's landing). The handoff named no thread number: this file takes 1. Proved: `pnpm --filter safebyok test`
1014 passed; `pnpm justify` green at the tip.

* **Built**: `ThingMinder` (`packages/safebyok/src/minding/thing-minder.ts`) is one minder per bank, minding every
  kind of Thing through one watch of the bank, in a `TSQ.QueryClient` it makes in its constructor and exposes
  nowhere. `make(opts, bank)`; `MinderOpts` is `{ vaultDB, queryCacheOpts? }`. The defaults live in
  `new QueryClient({ defaultOptions: { queries } })`, with the root box's `gcTime: Infinity` set by
  `setQueryDefaults` on its key. `get`, `tryAt`, `at`, `isStaleAt` take a scope; the minder builds each get ask with
  `bank.makeGetAsk({ labelpath, ifAbsent: 'nil' })` (`#askAt`). `list(labelpath)` lists any Thing's children.
  `ScopeAt<L>`, `ThingAt<L>`, `CarAt<L>`, `BankCar` type cars by labelpath (thing-car.ts, types only). Tests:
  `tests/minding/thing-minder.test.ts`, one minder world. VOCABULARY.md's minder, watch and car rows follow; its
  ties row is gone.
* **Decisions made**:
  - `hello` after `goodbye` works: `goodbye` unwatches and `clear()`s the cache; the defaults, set once in the
    constructor, survive. Tested ("lets hello start the minder again").
  - `goodbye`'s `clear()` still refuses a waiting get `disabled`: `queryCache.clear()` destroys each query, which
    cancels its fetch silently, and the minder maps `CancelledError` to `disabled`. Tested.
  - `get` relies on the default `queryFn` (it passes only the key, plus a staleTime fn when given).
  - `#fetchCar` no longer checks `#demandReady`: its only caller outside `get`/`tryAt` was a host observer.
  - `queryKey` stays public (tests read it, and safebyok-react's bridge will want it); `keyPrefix` is gone.
  - `NotACar` loses "by a select, a placeholder or a write under its query key": nothing but the minder writes now.
* **Deviations** (contract changes, each a row for the Coach):
  - Observers: hello's doc promised "A TanStack observer of a minder's `queryKey` then fetches and merges cars too."
    Gone, with its tests: no host can reach the client.
  - `MinderOpts.tsq`: "A host may share its own." Gone, per the handoff.
  - Invalidation: the `invalidate` listen event and the docs naming invalidation are gone, since nothing outside
    can invalidate. A refused get still marks a car invalidated inside TanStack, which is why a refused full car
    is stale under `Infinity` and timely under `'static'`; that test survives, merged with the old invalidation one.
  - Asks: tests promised "sends the vaultDB the ask exactly as given", and refused an ask without `ifAbsent: 'nil'`
    or a `track`. Now the bank's ask is sent for the scope; a refusal's `ask` is the loggable scope with
    `op: 'get', ifAbsent: 'nil'`, no track.
  - Kinds: a scope of another kind refused `bad_record` (`ModelkindMismatch`); every kind is now accepted.
  - The class doc's "Supplying a `structuralSharing`, or `placeholderData` that is not a car, is unspecified
    behaviour" went with the host's client.
  - The Coach's exemplar header in thing-minder.ts lost "invalidation, ".
* **Approaches set aside**: keeping a `tsq` accessor for safebyok-react (the handoff says the bridge goes through
  `listen`); a cache-wide prefix filter in `listen` (one minder, one cache: nothing to filter); an `#isReady` check
  in the `queryFn` (no outside fetcher remains).
* **Discoveries**: thing-car.ts's comments on `bestCarOf` and `isThingCar` still say TanStack calls them on an
  observer's selected and placeholder values; true of TanStack, moot for a private client. Left, as the merge
  logic was out of scope.
* **For the Coach**: the deviations above; whether `queryKey` stays public.
