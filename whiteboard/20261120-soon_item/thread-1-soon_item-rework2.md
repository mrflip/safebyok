# Thread 1: soon_item, rework 2 (2026-11-20)

Branch `20261120-soon_item`, PR #790. Directives 1 and 2 are the Coach's; 3 is the orchestrator's, awaiting the Coach.

Commits: `d2f6dfe52` (1), `d0849b63c` (2), `b84aab323` and `d63c73075` (3: drop these two to drop it).

* **1, names**: STYLE's examples are `isInvalidated`/`isTimely` and `isBehind`; `#isDBNewerAt` is `#isBehindAt`.
* **2, an older whole record is dropped**: `#sendToTSQ` lands a whole record, tombstone or shell unless `Thing.cmp`
  puts it older than the item (`isOlder`); one at the item's revision lands, moves `dataUpdatedAt` and tells
  `success`. A dropped record still joins its parent's listing, which depends only on which records arrived. The
  wontfix entry is now "A get's late, older answer..."; a get's answer is landed by TanStack itself, so it is unchanged.
* **3, host staleness from evidence**: public `minder.isBehindAt(scoped)` over the private one; the guards take any
  `{ queryKey }`; `GiverEvent` is not generic (`data: unknown`, plus `userid`, `banklabel`, `labelpath`);
  `giverBankOfMinder` passes soon events and has `isBoxRecordBehind` (false for a labelpath not a box's: a staleTime
  function runs in render and must not throw). `makeReactGiver` holds the started bank through `onBankStart`, so the
  host staleTime `() => isBehind ? 0 : Infinity` is synchronous (Infinity with no bank). The bridge invalidates the
  item's host entry on a soon's `success` (key by `boxRecordQueryKey`, which is `itemQueryKeyOf`). The wontfix host
  half is gone; the bridge's and `recordQueryDefaults`' comments say what holds.
* **Deviation (3)**: the item's `invalidate` keeps TanStack's default `cancelRefetch: true`; the soon's `success` and
  the `error` pass `false`. With `false` on the item's too, three in-any-order tests went red (`fetch, bridge, list`;
  `list, bridge, fetch`; `bridge, list, fetch`): the bridge's catch-up refetch, answered at once from the minder's older
  item, was still settling when the list landed, both invalidations kept it, and the hook showed the older record until
  it next mounted. A staleTime of 0 marks it stale but refetches nothing for a mounted observer.
* **Set aside**: a `get` honouring `#isBehindAt` in `#tsqQueryOptions` (staleTime 0 while behind). A listener told of a
  soon hears it before the item is invalidated, so a get from that listener answers the older item; the fix makes get
  agree with `isStaleAt`, and has a test that bites. Not needed once the item's invalidate cancels, so not built: an
  open matter.
* **Tests (3)**: react-bridge "refetches the host's entry for the item when the minder caches a newer soon" and
  "counts the host's entry stale while the minder's item is behind, though a setQueryData or a fetch has landed since"
  (red with a constant `Infinity`); minder-giver "refetches the entry when a newer revision is listed after a refused
  get" (replaces "marks the entry stale ..."); thing-minder-cache `ThingMinder.isBehindAt`. The fake world has
  `_cheat_hearSoon`, and its get leaves the item behind a soon newer than its answer, as the minder does.
* **Safety hatch (3)**: `react-bridge.ts` imports `ThingMinder` from `safebyok` under the same
  `import-x/no-extraneous-dependencies` disable as the other giver files.
