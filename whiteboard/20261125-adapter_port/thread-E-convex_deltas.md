# Thread E: convex_deltas (2026-11-25)

Branch `20261125-convex_deltas`, PR #931, stacked on #923. Proved: `pnpm --filter safebyok-convex` lint, typecheck,
test (231 passed); `pnpm justify` after the catch-up: JUSTIFY.

## Design

**Convex has the change stamp: `db.vars.commitTs`** (docs.convex.dev/database/advanced/commit-timestamp; in convex
1.49.0 and convex-test 0.0.69, both installed). A mutation writes the placeholder into a field, and Convex fills in the
transaction's commit timestamp, an int64 strictly increasing in commit order. Its sibling, `ctx.meta.getSnapshotTs()`,
is the timestamp of the snapshot a query reads: no document will ever be committed at or below it. So:

* **Stored.** Each `things` document gains `commit_ts: v.commitTs()`, which `writeAt` writes as `db.vars.commitTs`
  on every insert and replace, and an index `by_commit` on `[userid, banklabel, commit_ts]`.
* **The query.** `watchThings({ scope, cursor })`, `cursor` an int64 or null. Given a cursor, it returns each Thing of
  the bank committed after it (one range of `by_commit`), the bank raw (for the notices' banktok), and as `cursor` the
  last such Thing's `commit_ts`, or the cursor it was given. Given null, it reads no Thing and returns
  `getSnapshotTs()` as its `cursor`: the watch starts from now, as today's first result did.
* **The client.** `doWatch` subscribes with null; on each result it passes on each Thing, and where the cursor moved,
  unsubscribes and subscribes again from the new one. Each result is a consistent snapshot, and every commit after it
  has a higher `commit_ts`, so nothing falls between one subscription and the next. Still Convex's reactive query: no
  polling, no timer. Gone: the `JSON.stringify` of every Thing, `serializedOf`, `changesOf` and the `seen` map.

**Set aside.**
* *A counter of our own* (the top `commit_ts`-like field read with `.order('desc').first()` and bumped): OCC would make
  concurrent writes to one bank conflict and retry, and Convex already has the sequence.
* *`Date.now()` or `_creationTime` as the stamp*: frozen at the function's start, not commit order, so a write that
  started first and committed last would fall behind an advanced cursor (the docs warn of exactly this).
* *Reactive pagination*: re-sends a whole page when a document in it changes; no deltas.
* *Null meaning "send everything"*: the first result would carry the whole bank, which the watch only ignores.

**Kept.** A failing subscription reports to `onBadNews` and keeps running, as now; a Convex watch never ends on its
own, so it never calls `onEnded` (and `AdapterVaultDB.watch` does not take one on this base). One unsubscribe guard
stays, since Convex counts a query's watchers; no guard for a result landing after the stop (`#no-slop-crossings`).

## The thread

* **Built**: `commit_ts` and `by_commit` in `src/component/schema.ts`; `watchArgs` and `thingsWatched` in
  `validators.ts`; `watchThings` and `committedAfterIn` in `things.ts`, `writeAt` stamping each write; `doWatch` and
  `#subscribe` in `convex-vault-db.ts` (`serializedOf`, `changesOf`, `Filed` gone; a local `noop`, since es-toolkit is
  no dependency here). Tests: a component-watch describe (only the Things after the cursor; its own bank alone) and a
  client-watch describe (one subscription as the cursor moves, none once stopped; each Thing heard once; a listener
  that stops the watch on a Thing; a second watch on the same client survives the first stopping twice), plus a cursor
  that is not an int64 refused. README's watch bullet, *What is stored* and *How big a bank can be*; a changeset.
* **Decisions made**:
  * *`#subscribe` returns `{ stop, replay }`*: a ConvexReactClient already watching the query sends no first result,
    so the held one is replayed by hand; doing it inside the subscribe call could resubscribe before the caller held
    the old handle. `watchFrom` assigns `unsubscribe` first, then replays.
  * *`isWatching` checked in `hearThings` as well as in the stop*: a listener told of a Thing can call the watch's stop
    synchronously (receive, notify, the host's `onNotice`, stop). Without the check, the watch then resubscribes from
    the new cursor after its stop, leaking a subscription, and its later `unsubscribe` lowers Convex's watcher count a
    second time (an unhandled `numSubscribers` error in the test). This is a synchronous path, not a timing crossing,
    so it is not the guard `#no-slop-crossings` forbids; the test "subscribes no more once a listener stops it on
    hearing a Thing" fails without it.
  * *`CommittedThingDoc` and an `as` cast* in `committedAfterIn`: Convex types `commit_ts` as `bigint |
    CommitTsPlaceholder`, since the writing mutation reads back the placeholder; a query always reads the bigint.
    The cast is confined to the one query-only helper.
* **Deviations**: the guard above, beside "keep only the unsubscribe-once". `onEnded` stays unwired: a Convex watch
  never ends on its own, and `AdapterVaultDB.watch` on this base passes `doWatch` no `onEnded`.
* **Discoveries**:
  * Convex has the delta machinery built in: `db.vars.commitTs` (an int64 in commit order, indexable) and
    `ctx.meta.getSnapshotTs()`. Nothing hand-rolled beyond the cursor hand-off.
  * Convex's schema push refuses existing documents missing a new required field, so the stored-shape change needs
    the table emptied (the changeset says so). `v.optional` would have spared that, at the cost of a field the watch
    cannot range over; before 1.0.0 nothing binds backward, so I kept it required.
  * `db.replace` with `db.vars.commitTs` is proven only under convex-test 0.0.69; the docs say any write may carry it.
  * A watch away long enough (a client offline) comes back to one result holding every Thing written meanwhile, so the
    bank-size limit now binds the stats and that case only, not every change.
  * Plain `npx vitest` in the package cannot resolve `safebyok/storage` until the core is built: run it through
    `pnpm --filter safebyok-convex test` first.
* **For the Coach**: **existing deployments** must empty the component's `things` table to take this release; the
  alternative is an optional `commit_ts` and a watch that ignores unstamped Things. Recommend required, as built.
* **Looked up**: the plan's thread E (`rg -n 'Thread E'`, adapter_port-plan.md, lines 121-130).
