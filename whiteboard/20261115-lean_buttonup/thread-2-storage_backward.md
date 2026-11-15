# Thread 2: storage going backward, the proposal (2026-11-15)

For the Coach and whoever builds it: how the minder tells storage going back from a late answer, and what it does.
Not built: the orchestrator asked to see it first.

A get whose answer sorts before the record the cache held **when that get began** means storage went back (a lost
row, a rollback). One that sorts before a record that landed **during** the get only lost a race (notes/wontfix.md,
"A late, older answer"), and stays as it is. So the `queryFn` takes `prior = this.at(ask)` before it asks:

```ts
queryFn: async () => {
  const prior  = this.at(ask)                           // held before asking
  const answer = await this.#vaultDB.tryGetThing(ask)
  if (! answer.ok) { throw answer.err }
  const record = answer.val ?? this.#voidSentinelAt(ask)
  if ((prior !== undefined) && (cmpRecords(prior, record) < 0)) { throw Throwers.storageWentBack(ask, prior, record) }
  ...deliver and return as now
}
```

Throwing caches nothing of the older record, and TanStack's `error` action keeps `prior`, leaves its
`dataUpdatedAt`, sets `isInvalidated` (so `tryAt` answers `untimely` and the next get asks again), and stores the
refusal (`tryAt`'s `lastErr`); `get` rejects with it. A later notice of a newer record clears it. The refusal kind
would be `record_conflict`. The other way: no throw, invalidate once the fetch settles, which needs a flag carried out
of the `queryFn` to `#doGet`, and loses the refusal.
