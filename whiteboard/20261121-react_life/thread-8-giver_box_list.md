# Thread 8: giver_box_list (2026-11-21)

Branch `20261121-giver_box_list`, PR #PRNUM, stacked on #803. Proved: `safebyok-react-lean` lint, typecheck, test (giver: 3 files, 113); `safebyok` `thing-minder-keys.test` (6).

* **Built**
  - **`Knock.useBoxList()`** (`react-giver.tsx`, in `makeBankGiver`): `useQuery` over the root box's listing, with the userid `useShownSnapshot` shows. No arguments: labelpaths are flat, so the root is the only listing.
    - **What it answers**: `data` is the boxes' **host labelpaths** (`'jokes'`, never `'box/jokes'`), in labelpath order, `readonly string[]`: hand each to `Knock.useBox(labelpath)`. **Tombstones included**: a deleted box stays listed and its `useBox` answers null (the dream's "tombstones included"); a row hides itself on null. The same array until a box joins (the host's `select` is a module-level function, so TanStack reruns it only on new data, and shares structure on what it returns).
    - **Loading**: `data` undefined, `isPending` true, until the first fetch lands. **Signed out**: `data` undefined, `fetchStatus` `'idle'`, key `['sok', null, banklabel, 'box', '#', 'kids']`, `queryFn: skipToken`. **No bank stored** (unborn): `[]`. **Locked**: lists as usual (labelpaths are not secret).
    - **Its fetch** (`getBoxListing`): `await device.hello()`, `await minder.list('box')` (asks the vaultDB), then answers `minder.listingAt` of the root, which is the listing the minder keeps (everything listed or landed since `hello`), not just the list's answer.
    - Defaults: `ListingQueryDefaults` (`giver-defaults.ts`), `networkMode: 'always'`, `staleTime: Infinity`: the bridge keeps it current.
  - **The key**: the host's listing key is the minder's own, `['sok', userid, banklabel, 'list', 'box', '#', 'kids']`, made by **`ThingMinder.listQueryKeyOf(scope)`, a new static in the core** beside `itemQueryKeyOf` (tested in `thing-minder-keys.test`). `boxListQueryKeyOf` in `giver-defaults.ts`; **`Knock.keys.boxList()`** gives it, reading the slot when called. `keys.under()` does not start it (tested): invalidate both when a host wants everything refetched.
  - **The bridge** (`react-bridge.ts`): `deliverListing` copies a box listing's `success` into the host's item where a hook made one (`setQueryData`, `updatedAt` the minder's listed time), and invalidates the host's item on the minder's `invalidate` (which an active hook refetches, as for items). It writes only the host's client, never calls the minder (ground rule 7). Nothing else: no refetch-on-anything, no ordering (ground rule 8).
  - Tests: `react-giver.test` *useBoxList* (5: signed out then signed in; unborn answers `[]`; grows when a box is written, the same array through a rewrite of a listed box; a deleted box stays listed; the key, and `keys.under` not covering it). `react-bridge.test` *the bridge's listing* (2: another device's box shows with no second list; a minder `invalidate` lists again).
* **Decisions made**
  - **Host labelpaths, not core ones, not items**: envman renders each row through its own `useBox`, which takes the host's labelpath; items would make every row redraw for any box's change. The host's item holds the minder's core labelpaths (so key and value match the minder's, as for items) and the `select` maps them.
  - **Not filtering tombstones**: the dream says tombstones included, and the core lists them. A filter would need each record, which is `useBoxes`' job.
  - **No `opts` and no `boxListQuery`/`useQueryOptions().boxList`**: nothing calls for them yet; each is a few lines over `boxListQueryKeyOf` and `getBoxListing` when an app does.
* **Deviations**
  - **A core export**: `ThingMinder.listQueryKeyOf` (packages/safebyok), rather than spelling the minder's key grammar in the giver. The brief said to leave the grammar alone; this exports it, unchanged.
* **Discoveries**
  - The host's fetch answers `listingAt` read just after its list; a box joining between that read and TanStack landing the answer (a microtask or two) is overwritten by the answer, and shows at the next join or fetch. Out of bounds by ground rule 8; noted, no code.
  - `minder.invalidate` has no caller in `src/`: the bridge's invalidate path serves a host that calls it.
* **For thread 10 (envman)**: `const { data: labelpaths } = Knock.useBoxList()`; `labelpaths?.map((lp) => <Row key={lp} labelpath={lp} />)`; in `Row`, `const { data: box } = Knock.useBox(lp)` and render nothing where `box === null` (deleted). A box `putBoxOnce` writes under a minted label joins the listing by the time the write resolves. `useBoxes` is not built.
