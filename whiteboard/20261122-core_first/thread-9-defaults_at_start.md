# Thread 9: defaults_at_start (2026-11-22)

Branch `20261122-defaults_at_start`, PR #852, stacked on #851. Proved: see the PR's **Tests:** line.

The Coach: "If it's supposed to be given at start do that?", of `restoredSharingOf` and `RestoreOpts`' stand-in query
options, which existed because each minder set its bank's query defaults at `hello`, after the restore.

* **Built**: `Minder.makeClient` (`packages/safebyok/src/minding/minder.ts`) sets one query default on the prefix
  `[MinderKeyRoot]` (`'sok'`, new in `minder-keys.ts`, which every minder key starts with): `FixedQueryCacheOpts`, plus
  a `queryFn`, a `staleTime` function and a `structuralSharing`. The per-client registry is now the minders themselves
  (`MindersOfClient`, `#minders`: bank key-head hash to the minder minding it; the `Lander` type is gone), so each
  dispatches by the key's bank: `queryFn` to the minder's new `#fetchAt` (a listing key lists, an item key gets),
  `staleTime` to the minder's own (0 for a listing, and 0 where no minder minds the bank, as TanStack's own default), the
  cache-level `onSuccess` to `#landedByFetch` as before. `#setQueryDefaults`, `restoredSharingOf`, the stand-in options
  in `RestoreOpts` (now only `deserializeData: deepFreeze`) and the "set at hello, not at make" rule are gone. `list`
  no longer passes `staleTime: 0`: the listing's default is 0.
* **Decisions made**:
  - **One prefix, not one per kind.** TanStack matches query defaults by key prefix, and the kind of entry sits after
    the bank's three segments, so at `makeClient`, with no bank known, only `'sok'` is a prefix to match. Each option
    that differs by kind reads the kind itself: from the key, or for structural sharing, which TanStack hands no key,
    from the value (`isKids(next)`, as `restoredSharingOf` did, now with the minder's `deadAt` for an item's Absent).
  - **`setQueryDefaults(['sok'])`, not the client's `defaultOptions.queries`**: a host's own queries in the client keep
    whatever defaults the host gives them.
  - **A fetch where no minder minds the key's bank refuses `disabled`** (`Throwers.minderNotStarted`), as a
    get before `hello` does. Before, such a fetch had no queryFn before `hello` (TanStack's "Missing queryFn"), and after
    `goodbye` fetched through the gone minder's closure.
  - **Private access across instances**: the closures inside `static makeClient` call `minder.#fetchAt`,
    `minder.#landedByFetch`, `minder.#deadAt` and `minder.#queryCacheOpts`. TypeScript forbids `?.` before a private
    name, hence the explicit `undefined` checks.
* **Deviations**:
  - **The soon and dead entries lose `queryFn: skipToken`.** One `queryFn` serves every kind, and a function cannot
    answer skipToken. The minder never fetches a soon or a dead entry, and nothing in the repo observes one, so no
    behaviour of ours changes. What changes for a host: an observer of a soon or dead key would fetch it (skipToken made
    TanStack disable it), and a host's `refetchQueries()` over every query would refetch them, landing the item's record
    in them. Set aside: `enabled` as a function plus `staleTime: 'static'` for those kinds (two more functions for a
    case no one meets), and a sparse-array prefix such as `['sok', , , 'soon']` (TanStack's `partialMatchKey` skips the
    holes: works, but clever). Hosts are not the threat model; say if the skipToken should come back.
* **Discoveries**:
  - **A listing's staleTime of 0 reaches observers.** `useBoxList` (safebyok-react-lean) passes no staleTime, so it
    took the minder's (an hour by default); now it lists again at each mount and each window focus. Two minder tests
    that mount a `QueryObserver` on a listing now wait for its mount's list before acting.
  - **React's null-user placeholder keys** (`['sok', null, banklabel, ...]`, in `giver-defaults.ts`) also start with
    `'sok'`, so they now take these defaults: `gcTime: Infinity` among them. They carry `skipToken` while the bank is
    not up, hold no data, and are never saved.
  - `FixedQueryCacheOpts`' doc ("every minder sets") now says the client sets them; `Device`'s `#queryCacheOpts` doc and
    the comment in `react-giver.tsx`'s `boxQueryBaseOf` that said the minder's queryFn is "set in the client at its
    `hello`" are brought up to date.
* **For the Coach**: whether the window-focus re-list of `useBoxList` is wanted (it follows from the listing's default
  of 0); and whether the soon and dead entries should keep skipToken at the cost above.
