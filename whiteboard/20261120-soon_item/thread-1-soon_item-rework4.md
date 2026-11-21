# Thread 1: soon_item, rework 4 (2026-11-20)

Branch `20261120-soon_item`, PR #790, stacked on #784. Changes agreed with the Coach, 2026-11-20.

Commits: `69c9a3640` (the code and tests), `3b7c829cf` (VOCABULARY, wontfix, the changeset).

Proved: safebyok 1339 tests, safebyok-react 334, both typecheck and lint clean; `pnpm justify` at the tip (see the PR's
**Tests:** line).

* **Built**
  * **1, back to order A.** `#sendToTSQ`: a sparse record newer than `#soonestAt` lands in the soon, then
    `#markBehinds` invalidates the item, the same call a whole record's landing makes. `#invalidateItem` is gone: its
    one line and its comment moved into `#markBehinds`, its only caller. The class doc's invariant now says a listener
    on a soon's `success` knows the item is behind (`soonAt`, `isBehindAt`, `tryAt`, `get`), though the item's own
    `state.isInvalidated` may read false until its `invalidate` follows; the event invariant says `invalidate` comes
    just after the soon's `success`. `listen`, `ThingEvent` and `SoonEvent` say what a listener on each can rely on.
  * **2, `get` fetches an item behind.** `#tsqQueryOptions` gives `opts.staleTime` where the caller gave one, else
    `staleTime: 0` while `#isBehindAt` holds, else the query defaults'. `TsqStaleTime` and `MinderGetOpts` say a get
    fetches an item behind unless given a staleTime of its own, and an invalidated one whatever the staleTime.
    Tests in thing-minder-listen: "finds the soon cached and the item behind from inside a soon's success" and
    "answers the cached item for a get with a staleTime of its own from inside a soon's success"; the existing "asks
    the vaultDB for a get from inside a soon's success, as its item is behind" fails with the staleTime-0 line removed
    (checked by hand).
  * **3, `#newestAt` is `#soonestAt`**, in the minder and models/vault.ts, with their doc blocks; the vault's public
    docs say it writes over "the soonest record the minder has of the box (its soon, else its item)", and
    withWhisper's local `newest` is `soonest`. VOCABULARY's soon row names the **soonest** record. The wontfix
    entry's get holds "the soonest record cached when it began".
  * **4, the event order in tests.** Three expected sequences flip to soon `success`, then item `invalidate`:
    thing-minder-listen ("tells a newer sparse record in the soon, then the item invalidated, once, ..."),
    thing-minder-reads ("tells a listener of a listed box only its soon, and then its item falling behind"), and
    safebyok-react's minder-giver ("passes on each event of the minder about a box's item and its soon, ...").
* **Decisions made**
  * The staleTime-0 rule is in `#tsqQueryOptions`, as directed, not a function staleTime in the item's query defaults
    (TanStack resolves one per query): that would also need the explicit-option override, and spread the behind rule
    over two places.
  * The giver needed no change: its queryFn calls `minder.get` with no staleTime, so the host's refetch on a soon's
    `success` still fetches under order A.
* **Discoveries**
  * Inside a listener on a soon's `success`, `isStaleAt(scope, { staleTime: Infinity })` answers true (a read counts
    an item behind never timely) while `get(scope, { staleTime: Infinity })` answers the cached item without asking.
    Outside that listener the item is invalidated and both agree. Raised for the Coach below.
  * Earlier thread files and the design still say `#newestAt`: they record what was built then, and are left.
* **For the Coach**
  * **isStaleAt against an explicit staleTime**: in that listener window, `isStaleAt` and `get` disagree under an
    explicit staleTime, as above. Recommend leaving it, documented: the explicit staleTime is the caller's own choice,
    and `isStaleAt` still tells it the item is behind.
