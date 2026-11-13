---
"safebyok": minor
"safebyok-convex": minor
"safebyok-indexeddb": minor
"safebyok-postgres": minor
"safebyok-graphql": minor
---

**`Tidied`, what a `BankDB`'s `tidyGone` answers, gains `leftover`: `'none' | 'some' | 'many'`** (`leftoverVals` and the type `Leftover` are exported from `safebyok/storage`), what is left of the box rows of ended lives. `'some'` means one more call deletes the rest; `'many'` means it does not. A host that implements or fakes `BankDB` returns `leftover` from `tidyGone` (`'none'` for a store that deletes them all), or its answer is refused as malformed. The memory, IndexedDB, Postgres and GraphQL stores answer `'none'`; the GraphQL schema adds the enum `SafebyokLeftover` and the field `SafebyokTidied.leftover`, so a GraphQL server built on an older schema must be rebuilt. **Convex's `tidyGone` deletes the box rows of ended lives in batches** of up to 1000 rows or 2 MiB of them, whichever comes first, where it deleted as many as one transaction allowed and said nothing of the rest: call it again until `leftover` is `'none'`. It reads the bank's live box rows as it goes, as `watchRows` does, so it throws `storage_unavailable` for a bank whose live box rows pass about 12 MiB. **Stored format:** unchanged.
