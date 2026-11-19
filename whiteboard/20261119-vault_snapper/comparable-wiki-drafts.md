# Comparable: shared drafts for a team of Wikipedia editors

A use case close to ours in the ways that shape a React Query design, for checking our choices against what a
regular React Query user would build. Recorded by the Coach, 2026-11-19.

## The app

A small team shares a view of draft edits to Wikipedia articles.

* Records change over hours to months, or never. What matters about them only moves forward in time.
* A record has its own domain-specific structure: a draft, its article, its editor, its revision.
* Notifications come first as a sparse record saying an editor has made a change. Someone viewing that draft may
  want to bring it up to date. That feed looks exactly like our car: a newest revision heard of, beside the fullest
  record in hand.

## What a regular React Query user would build

**The cache holds the server's entity, keyed by what it is.** `['drafts', draftId]` holds the draft as the server
returned it: the stable, domain-shaped response. A view model (a diff, a word count, a title) is made per component
with `select`, which runs per observer and is memoized, not baked into the cache. A list query holds what the list
endpoint returned; a detail query may be seeded from it with `initialData` or `placeholderData`.

**A sparse notice is an event, not data.** This is TkDodo's *Using WebSockets with React Query*: the socket handler
calls `invalidateQueries({ queryKey: ['drafts', draftId] })`. An observed draft refetches; an unobserved one
refetches when next shown. Where the notice carries the whole record, the handler calls `setQueryData` instead. With
the socket keeping data current, the queries take `staleTime: Infinity`.

**"Alice changed this draft: reload?"** For a draft someone is reading or editing, an automatic refetch is unwelcome.
The handler invalidates with `refetchType: 'none'`, and the page shows the banner while `isStale && !isFetching`.
Where the banner must say who changed it or to which revision, that sparse notice goes in a small entry of its own
(`['drafts', draftId, 'latest']`), or in client state, and the page compares it with `data.rev`.

**A save cites what the editor started from.** The editor's base is `data.rev` of the draft they opened. The server
refuses a save over a newer revision, and the app refetches and merges. Nobody cites a newer revision they have not
seen, except to overwrite it on purpose.

**Snapshots and subscriptions are TanStack's.**

| | What it is | In the wiki app |
|---|---|---|
| `QueryCache` | Each query's state: `data`, `dataUpdatedAt`, `error`, `status`, `fetchStatus`, `isInvalidated` | The drafts and lists as fetched |
| `QueryObserver` | One component's subscription to one query, with its options (`select`, `staleTime`, `enabled`) | Made by each `useQuery` |
| The observer's result | The snapshot: `select`ed `data`, and `isStale`, `isFetching`, `isPlaceholderData` and the rest, derived from the state. The same object until a field the component read changes | What a component renders |
| `useSyncExternalStore(observer.subscribe, observer.getCurrentResult)` | How React reads it | Inside `useQuery` |
| The socket | An input to the cache, never a subscription of a component | The handler above |
| A client store (`useState`, Zustand, or `useSyncExternalStore` on a store) | State that is not the server's | Presence, the socket's connection state, who is editing now |

## What it says about ours

| Theirs | Ours |
|---|---|
| The server and its socket | The minder, its car merging every source, and `listen` |
| The socket handler | The giver's bridge |
| `['drafts', id]` holding the draft as the server returned it | The host's entry holding the box's car, as the minder returned it; the default `select` picks its fullest |
| A sparse notice invalidating the draft | A `behind` or `bare` car invalidating the host's entry |
| `isStale && !isFetching` for the banner | The same, on a `behind` car's entry |
| `select` for a view model | `select` over the box record (its sidecar is the customer's domain data) |
| The editor's base, `data.rev` | A draft's `base` |
| The observer's result | A record hook's snapshot: TanStack makes it, the giver makes none |
| The client store for presence and connection | The Snapper, for the lock stage, the open gating and the watch |
