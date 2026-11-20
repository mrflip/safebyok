---
---

Empty: the new `safebyok` is private, and the giver in `safebyok-react` that listens to a minder is not yet exported. What a caller of `ThingMinder.listen` will see:

- **`listen(listener, version)`.** `listen` takes the version of the feed its listener was written against, `ThingFormat`, and refuses any other `bad_record`. A change to the event's shape bumps `ThingFormat`.
- **TanStack's event in our own.** Each `MinderEvent` carries TanStack Query's cache event without its live query: its `type` (`'updated'` or `'removed'`), its `action.type` (`'success'`, `'error'` or `'invalidate'`, undefined for a removal), the query's `queryKey`, and a frozen shallow copy of the query's `state` (`data`, `dataUpdatedAt`, `error`, `isInvalidated`, `status` and the rest). `state.data` replaces `car` on a thing event and `labelpaths` on a listing event; after a removal it is undefined.
- **Decorated.** Every event carries its scope: `userid`, `banklabel`, `labelpath` and `modelkind`. A listing event's `labelpath` is the Thing whose children it lists, in place of `of.parentpath`. A thing event also carries its car's `agerank` and its newest record's `revtok`, `revseq`, `am`, `lifeseq` and `lifepath`, each undefined where no car is cached.
- **No `InvalidationEvent`.** An invalidated listing tells a listing event whose `action.type` is `'invalidate'` and whose `state.isInvalidated` is true. The type `InvalidationEvent` is gone; `MinderEventOf` is exported.
- **`'sok'`.** Every query key the minder caches under starts with `'sok'` in place of `'safebyok'`.

Nothing stored changes.
