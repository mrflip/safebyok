# box_persist: persisting boxes per bank, not per device (plan, 2026-11-22)

> "make a plan for box persisting" (the Coach, 2026-11-22, on the persister plug)

Read at `origin/20261122-idb_persister` (`43c77ec2e`). Nothing here is built or ruled.

## What is built

The device has two TanStack clients, `roots` (each user and bank's bank, main gate and root box) and `boxes` (every box,
soon, dead entry and listing). `Minder.persist` restores each from its `Persister` at `hello`
(`persistQueryClientRestore`, `maxAge: Infinity`), then saves it with `persistQueryClientSubscribe`, which hands
`persistClient` a fresh snapshot of the whole client at every cache event. The `IdbPersister` throttles those to one
IndexedDB `set` a second, of one record per client. The Coach ruled for the most liberal policy, with no options engine,
and asked for a TODO on a persister's size limit.

## What grows, and how fast

* **Every user ever signed in keeps their boxes.** The device serves one user per page, but `hello` restores the whole
  `boxes` snapshot, every earlier user included. Their entries sit in the cache at `gcTime: Infinity`, and no minder
  ever says `goodbye` to them, so each later save writes them again. An entry leaves only at `vault.sweep` (its minder's
  `goodbye`) or when its soon is caught up. Nothing is ever dropped by age.
  This keeps more than the Coach's first sentence named ("all boxes for the active user, for all user+bank the root box
  and listing"). It is what "most liberal" gives.
* **Each change costs the whole snapshot, twice.** `persistQueryClientSubscribe` runs `dehydrate` over the whole client,
  in the event's own call stack, at every `added`, `removed` or `updated` event. Every action a query dispatches (a
  fetch starting, a record landing, a refusal) is an `updated` event. The throttle then drops all but the newest, and
  IndexedDB structured-clones that whole value at the `set`. So the work done in the page grows with every box of every
  user, and IndexedDB's with the snapshot's size once a second while anything changes.
* **Rough size (inferred, not measured).** A box is a few sealed parts plus labels and stamps: about a kilobyte or two.
  Fifty boxes a user and ten users on a shared browser makes a snapshot of about a megabyte, rewritten each second
  while a listing refreshes. That fits IndexedDB comfortably. The real costs are the `dehydrate` walk on every event, and
  memory holding other users' boxes that this page will never serve.
* **Between tabs**, the last tab to save wins the whole snapshot, and entries only the other tab knew are gone until they
  are fetched again. The bankDB is the ground truth, so nothing is lost but a refetch. It is a property, not a design
  input.

## The options

**A. Keep the one snapshot, and cap it.** Add the size TODO and nothing else, or save only the active user's boxes plus
each root listing (a fixed `shouldDehydrateQuery`, which is not an options engine, but it is a predicate the Coach ruled
out for now). *Costs*: nothing now. *Gives up*: the work per change still grows with every user's boxes. A cap that
drops entries is a policy, and a cap that refuses to save leaves an old snapshot standing. *Library first*: yes.
*Restore*: all at `hello`.

**B. One snapshot per user and bank.** The same TanStack loop, run once per bank: the `boxes` client is saved by a
`persistQueryClientSubscribe` whose `shouldDehydrateQuery` keeps only the signed-in bank's entries (by the bank-head
key prefix every entry already has), to a `Persister` of that bank's own. The `IdbPersister` already keys by
`recordlabel`, so this is a record per bank, `boxes:<userid>:<banklabel>` or similar. *Costs*: the plug changes shape.
`boxes` becomes a function from a bank's scope to a `Persister` (or one `persisterOf(recordlabel)` serves both clients).
The device restores `boxes` at `signIn`, not at `hello`. *Gives up*: other users' root listings are not in memory before
or after `signIn` (see Questions), and a save still rewrites all of one user's boxes. *Library first*: entirely
TanStack's stable `persistQueryClient*` API and its `Persister` interface. *No options engine*: yes, since keeping every
bank's record stays the policy. *Restore*: `roots` whole at `hello` (one world per user and bank, small), then that one
bank's `boxes` at `signIn`, before the `VaultMinder` says `hello`.

**C. TanStack's per-query persister, `experimental_createQueryPersister`.** It plugs into a query's `persister` option,
which `FixedQueryCacheOpts` now pins to a pass-through. *Costs*: its automatic write runs only after a `queryFn` (a fetch).
The records the minder lands by `setQueryData` (the watch's notices, a `putBox`'s answer) are never written, and soons and
dead entries are never fetched (`skipToken`), so they are never written either. A removed entry is never deleted.
Covering those means our own `QueryCache` subscriber calling its `persistQuery` and the storage's `removeItem`, so we
would own the loop after all. Its `restoreQueries` goes through `setQueryData`, which keeps only data and
`dataUpdatedAt`. It drops a refused get's error state, runs the query's structural sharing rather than a raw restore, and
does not freeze what it restores. `restoreQueries` and `removeQueries` deserialize every stored entry to filter, unless
our storage scopes `entries()` itself. Its default `maxAge` is 24 hours. *Gives up*: exact restore. The API is
`experimental_`, and can change in a minor version. *Library first*: in name more than in fact. *No options engine*: yes.
*Restore*: lazily on a query's first fetch (`persisterFn`), or eagerly per key prefix (`restoreQueries`).

**D. A write per entry, from our own feed.** As the retired `IdbMinderBridge` did: hear each change (from
`minder.listen`, or a `QueryCache` subscriber, which also sees soons, dead entries, listings and removals) and write
that one entry to an IndexedDB store keyed `[userid, banklabel, queryHash]`. For an exact restore, each entry can be
stored as `dehydrate` gives it (`dehydrate` with a one-query `shouldDehydrateQuery`), and a bank's key range read back
through TanStack's own `hydrate`. *Costs*: our own subscription, batching and delete code in the adapter (perhaps 60
lines), and one IndexedDB transaction per change or per tick. *Gives up*: a snapshot consistent as of one moment. A
listing and its items can be restored from different moments, as when the cache fills from the vaultDB over time
(inferred harmless; not checked against the listing's `deltas`). *Library first*: `dehydrate`/`hydrate` are TanStack's,
and the loop is ours, which is hand-rolling, and wants a Coach's yes. *No options engine*: yes. *Restore*: per bank at
`signIn`, one key range.

| | work per change grows with | restore | own code | exact restore |
|---|---|---|---|---|
| A snapshot | all users' boxes | all, at `hello` | none | yes |
| B snapshot per bank | the signed-in user's boxes | roots at `hello`, boxes at `signIn` | the plug's shape | yes |
| C per-query (TanStack) | one entry | lazy, or per prefix | a subscriber, to cover writes and deletes | no |
| D per entry (ours) | one entry | per bank at `signIn` | subscriber, batching, delete | yes, via `hydrate` |

## Where retention plugs in later

With B or D, retention is a delete of a bank's record (B: that bank's `removeClient`; D: one key range). It is decided at
`hello` from what `roots` already lists, every user and bank seen, and TanStack's own `PersistedClient.timestamp`
(B) gives when each was last saved. Today that step keeps everything, and needs no option. Later an options engine
supplies the rule that picks what to drop. With A, retention is a `shouldDehydrateQuery` in `SaveOpts`, and the same
single plug. `persistQueryClientRestore`'s `maxAge` only checks a record when it is restored, so it never clears a user
who does not come back.

## The size-limit TODO

At the `IdbPersister` and on `DevicePersisters`' doc block. A save past the origin's quota is refused `vault_full` and
told to `onBadNews` (built), and the last snapshot stands. TanStack's own shape for shrinking a snapshot that fails to
save is `PersistRetryer`, with `removeOldestQuery` (drops the entry with the oldest `dataUpdatedAt`, then tries again).
Adopting it later keeps the mechanism library first. It retries, but off the critical path of any primitive operation.
With B, the limit bounds one user's boxes, not the device's.

## Recommendation

**B.** It keeps all of TanStack's stable machinery and exact restore, with no new loop of ours. It makes the work per
change grow with the signed-in user's boxes alone. It restores the boxes where they are needed, at `signIn`, before the
`VaultMinder` says `hello`, and it gives retention one natural seam: a bank's record. D is next, if one user's boxes
ever prove too many to rewrite whole. C does not fit a cache filled by `setQueryData`, and its restore is not exact.
Note that B loosens nothing ruled. It keeps every user and bank's boxes stored, but restores only the signed-in
user's.

## Verified, and inferred

* **Verified in source**: `@tanstack/query-persist-client-core` 5.107.1 (in `/workspace/byok-misuse_cull`'s
  node_modules): `persist.ts` (restore discards and rethrows on failure; save runs `dehydrate` in the event's call
  stack; subscribe saves on `added`/`removed`/`updated` of both caches), `createPersister.ts` (writes only after `queryFn`;
  restore by `setQueryData` with data and `dataUpdatedAt`; `entries()` scans; key `prefix-queryHash`; default `maxAge` 24
  hours), `retryStrategies.ts` (`PersistRetryer`, `removeOldestQuery`). In `@tanstack/query-core` 5.107.1: every
  `#dispatch` notifies `updated`; `setData` runs `replaceData`.
* **From the branch**: `FixedQueryCacheOpts` (`gcTime: Infinity`, `persister` pinned), `goodbye` removes the bank's
  entries, `vault.sweep` is the only caller, and the device serves its first user for its life.
* **Inferred, not checked**: box sizes and the megabyte figure; that a mixed-age restore (D) is harmless; that the
  stock async-storage persister takes a `retry` (from memory: the package is not installed here).

## Questions for the Coach

1. B restores only the signed-in user's boxes. Is any other user's root listing wanted before `signIn` (a picker
   showing box labels per user)? If so, the root listing moves to `roots`, or stays in A's snapshot.
2. The plug: `boxes` as a function of a bank's scope, or one `persisterOf(recordlabel)` for both clients?
3. Should the boxes restore hold the stage at `'starting'` too, or may a cached world show `'locked'` before the boxes land
   (they still land before the `VaultMinder` says `hello`)?
4. The size TODO: a comment now, and `removeOldestQuery` later? Or should the `IdbPersister` take TanStack's
   `PersistRetryer` now, defaulting to none?
