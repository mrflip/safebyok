# Thread 23: The Coach's fingerpaints and Closer Look marks (2026-10-31)

Branch `20261031-coach_sweep`, PR pending, stacked on #405. Justify: not yet run (model tests green).

* **Built** (so far): the fingerpaints' structure (one commit): `tattoo`/`tattooProp` exported
  from `src/helpers.ts` with tests; `assign(record)` one argument; plain assignments for the props
  that follow the record; `isFullRecord` false for a tombstone; `isWholeRecord`/`isTombstoneRecord`
  honest guards; `isTombstone` spelled `'d' || 'x'`; `#minted` → `#memoizedNextRevision`; `tell`
  gone, `Listing.tellBadNews` public.
* **Remaining:** renames (`priorRevisionTok`, `#cacheOnDevice`, `buildableRecords`), the send guard
  pair, docs, the rulings (`Cache.save`, `minRefreshMillis`), `becomeNotifiable`, the guarantees line.
