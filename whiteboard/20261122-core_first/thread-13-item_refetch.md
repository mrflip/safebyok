# Thread 13: item_refetch (2026-11-23)

Branch `20261123-item_refetch`, PR #TBD, stacked on #854. Proved: safebyok `tests/minding` 333 passed, safebyok-react-lean 307 passed, lint and typecheck of both clean; `pnpm justify` at ready.

* **Built**: the minder is the one owner of refetch for items, as thread 8 made it for listings. `Minder.#markBehinds`
  (packages/safebyok/src/minding/minder.ts) invalidates an item that falls behind its soon with TanStack's default
  `refetchType: 'active'` and `{ cancelRefetch: false }`, where it had `refetchType: 'none'`. The giver's
  `refetchMarked` effect and helper are gone (packages/safebyok-react-lean/src/giver/react-giver.tsx), with the imports
  only it used. The per-observer `staleTime` in `recordQueryDefaults` stays. The minder's Invariants bullet on an item
  behind, `list`'s doc block and the comment on `#markBehinds` say who fetches it.
* **Tests**: three minder tests in `vault-minder-staleness.test.ts`, *VaultMinder's item behind a newer sparse record*:
  an observed item behind is fetched again, once; an observed item a refused get left invalidated is fetched again when
  it falls further behind (the case the giver's soon-`success` branch covered); an unobserved one is not fetched until a
  get. The first two fail under the old `refetchType: 'none'`. The giver had no test of its own for `refetchMarked`;
  record-hooks' "keeps showing the older record, stale, while the newer revision a list told of is fetched whole" is
  the react-lean test that a mounted `useBox` shows the newer record after a sparse record lands, and passes unchanged.
* **Decisions made**: `cancelRefetch: false`, as the giver had and as `invalidate` has for listings: a fetch under way
  is left to land, and its landing marks the item again if it landed behind. TanStack refetches an active item on every
  `invalidateQueries`, even one already invalidated, so the giver's second trigger (the soon's `success`, for an item a
  refused get left invalidated) needs no counterpart.
* **Discoveries**: docs/guide-react_query.md says nothing of who refetches; left as is. BankMinder items take the same
  path, but nothing observes them through TanStack today.
