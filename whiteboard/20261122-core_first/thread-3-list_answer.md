# Thread 3: list_answer (2026-11-22)

Branch `20261122-list_answer`, PR #847, stacked on #844. Proved (by package, before the catch-up): safebyok 1441, safebyok-react-lean 304, safebyok-postgres 350, safebyok-idb-lean 123 tests green; typecheck and lint clean in each.

* **Built**:
  * `storage/vault-db.ts`: `Kids` (`{ modelkind: 'kids', parentpath, parentlife, items, gones, read_tc }`), `KidEntry`, `ReadTc`.
    `ListThingsAnswer`: good `val` is the `Kids`, `read_tc` beside it; `ListedBeside` is now `parentage` (array), `deltas`,
    `damaged_rows`, good or refused. `ListThingsActual` carries `kids` when good.
  * `storage/thing-classifier.ts`: `classifyListThings` builds the `Kids` from the store's `read_tc` (`ThingsFetched.read_tc`,
    checked as a UUID v7, `storage_issue` otherwise); `readTcNow()` makes one with the `uuid` package's `v7`.
  * `AdapterVaultDB.notifyListed`: notifies `parentage` then `deltas`, on good and refused lists (the parentage is what a
    refused list found stored, like a dbhas).
  * Stores: `MemoryVaultDB`, `IdbVaultDB` (safebyok-idb-lean) and `PostgresVaultDB` call `readTcNow()` in the step.
  * `VaultMinder`: the listing is the `Kids` value, replaced whole; `landedKidsOf` keeps a prior read later by `read_tc`
    (and gives anything else `replaceEqualDeep`, since TanStack runs it over a host's `select` output too). Gone:
    `#seedListing`, `isListingBareAt`, `#addToParentListing`, `BareListedAt`, `landedListingOf`. `list`/`tryList` resolve `Kids`.
    Rule (A) in `#isFirstStored` and `#settleLanded`.
  * React (`safebyok-react-lean`): `useBoxList`'s select reads the `Kids` labels (items and gones, sorted); doc updated.
    Mechanical, but its contract moves with the core's: data is undefined until the first list lands (no bare seed), and a
    box new to the listing shows once the list it causes lands (a test's list count went from 1 to 2).
  * Tests: the lists battery checks the `Kids` value, `deltas`, `parentage`, and `read_tc` (shape, and later for a later
    list); the minder's `listingAt` block is rewritten for the kids value, a new block covers rule (A), the
    order-independence suite now asserts "current or marked stale, then a list lists every box", and the event-order
    suite checks listings never go back by `read_tc`. Gone with the mechanism: `isListingBareAt`'s block, the stale-list
    order variants (a crossing), and the join tests.
  * Docs: VOCABULARY's *listing* rewritten and a *kids* row added; STYLE.md gains `_tc` and base-32 lines;
    `notes/wontfix.md` gains the write-during-list crossing row and one line of the goodbye row reworded.
* **Decisions made**:
  * `parentlife` is the parent's lifepath; where nothing is stored, the shell's lifeseq alone (`-000000001`), since the
    store fetches no grandparent to build a box shell's full lifepath.
  * `parentage` is the parent sparse, or `[]` where none is stored. Sparse, as `parent` was.
  * `read_tc` on the good answer only (and on `val`); a refused list has none.
  * The store makes `read_tc` in its step; Postgres makes it in JS before its statement (PG 14+ has no `uuidv7()`).
  * Rule (A), qualified as the handoff describes: the first landing of a stored record in the item or soon, while the
    other has no stored record; a shell marks nothing, and the first stored record over a shell counts as first
    (otherwise `putBoxOnce('box/new')`, which gets the shell first, never lists the new box). Invalidate with
    `cancelRefetch: false` (refetchType default 'active'): a list's own deltas join the list under way.
  * `list` keeps `staleTime: 0` (Coach ruling 2): the listing defaults keep the minder's staleTime, so a list needs it.
* **Deviations**:
  * `isListingBareAt` is removed (the bare root listing seeded at `hello` is gone with the joins, per the handoff).
  * A refused list now notifies its `parentage` (the record it found, as a refused get's `dbhas` is notified).
  * `vault.delBoxOnce`'s doc no longer promises the label stays in the parent's listing.
* **Discoveries**:
  * Literal `dataUpdateCount === 1` misses the base case: `vault.putBoxOnce('box/new')` first gets the box's shell, so the
    born record is the item's second landing. Counting the first stored record over a shell as first fixes it (in
    `#isFirstStored`); without it the React test "grows when a box is written" fails.
  * Without the "other entry has no stored record" qualifier, each `useBox` mounting under a listed `useBoxList` would
    mark the listing stale and re-list (N lists for N rows).
  * `landedKidsOf` must accept non-Kids values: TanStack runs the query's `structuralSharing` over a host's `select`
    output too (as the giver's `newerOrSharedOf` notes).
  * `notes/wontfix.md`'s row "A box joining between the host's listing fetch reading `listingAt`..." describes a
    mechanism already gone; left for whoever rules on it.
  * Looked up in the plan: thread 3's section and the `parentlife` remark in the design (the handoff was enough otherwise).
* **Glitches of rule (A)** (Coach ruling 1: recorded, not fixed):
  * A box's death, rebirth or second death on a cached listing lands in its existing item: not a first landing, so the
    listing keeps the old `items`/`gones` entry until the next list. Labels are unaffected (useBoxList lists both).
  * A get that answers a stored box over a cached shell (no watch notice) lands through the fetch, where the prior is
    unknown: not counted first.
  * A write that lands during a list read before it: its invalidation joins that list, whose landing clears it.
* **End states, for the final report**:
  * A bank's rebirth: every child of the new life lands in items the old life had; (A) does not mark the listing.
* **For the instance-sync thread**: (none yet)
