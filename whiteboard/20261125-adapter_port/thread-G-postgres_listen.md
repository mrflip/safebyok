# Thread G: postgres_listen (2026-11-26)

Branch `20261126-postgres_listen`, PR [#935](https://github.com/mrflip/safebyok/pull/935), on main. Proved: safebyok-postgres's tests (179, 9 of them new), typecheck
and lint while building; `pnpm justify` after the catch-up (see the PR's **Tests:** line).

* **Built**:
  - `packages/safebyok-postgres/src/postgres-listen.ts`: `makePostgresListen(client)`, which gives a `PostgresListen`
    on a node-postgres `Client` the host connects for it, and `PostgresListenClient`, the structural type of that
    client (`query`, `escapeIdentifier`, `on('notification')`). Both exported from `src/index.ts`.
    - One `notification` handler on the client routes each notification's payload (or `''`) to every `onNotify` on
      its channel, kept in a `Map<channel, Set<onNotify>>`.
    - A listen sends `LISTEN` only where the map holds no watch on the channel, then adds the handler. Its stop removes
      the handler, and when the channel's set is empty, deletes it from the map and sends `UNLISTEN`.
    - Nothing is caught: a failed LISTEN or UNLISTEN rejects with the driver's error, and PostgresVaultDB's existing
      `startListening`/`stopListening` refuse it with `refusalOf` (`storage_issue`, or `storage_unavailable` where a
      retry may mend it). So a failed UNLISTEN reaches `onBadNews`, per the Coach's ruling, with no code here for it.
    - Neither failure leaves anything cached: the next watch on the channel LISTENs again (LISTEN on a channel already
      listened to is a no-op in Postgres).
  - `src/phrases.ts`: `ListenClientExpected`, the refusal of a client that cannot LISTEN (a pg `Pool` among them).
  - `tests/postgres-listen.test.ts`: on an unconnected pg `Client` with `query` faked (LISTEN once and quoted,
    routing by channel, UNLISTEN at the last stop, LISTEN again after, a failed LISTEN and a failed UNLISTEN, sloppy
    clients); and under PostgresVaultDB on PGlite, dressed as a client (`pgliteListenClient`: PGlite runs raw
    LISTEN/UNLISTEN and reports through `onNotification`): a watch hears a write and `pg_listening_channels()` empties
    at the stop; a failed UNLISTEN reaches `onBadNews` as `storage_issue`, without `onEnded`.
  - The README's *Hearing other writes* recipe is replaced by `makePostgresListen`; a changeset (minor: a new export).
  - `notes/wontfix.md`: a row for the one crossing (below). `notes/security.md`: an entry on quoting the channel.
  - `@types/pg` as a devDependency of safebyok-postgres (the boring answer; `safebyok-postgres-big` has it), for the
    test's real `Client` and `Pool`.
* **Decisions made**:
  - **A maker, not a class.** `makePostgresListen(client)` returns the function `PostgresVaultDB` takes as `listen`,
    so `listen: makePostgresListen(listener)` needs no binding. `make` fits STYLE.md's verbs (synchronous, gives the
    thing in memory); `postgresListenOf` would promise purity, and it attaches a handler to the client.
  - **Quoting by the client's own `escapeIdentifier`.** pg's `Client` has it as a method, so the package still has no
    runtime import of `pg` (a PGlite host must be able to import the index) and quotes nothing itself. Set aside: a
    hand-written `"…"` quoting (the library has it), and `pg` as a peer dependency (breaks PGlite hosts).
  - **No reconnection, no `error` handler.** The host owns the client: the README's example attaches its `error`
    handler and says a lost client leaves watches quiet. Reconnecting would be a whizbang in the critical path.
  - **The returned listen does not validate its own arguments**: its only caller is PostgresVaultDB, which passes
    `thingsChannelOf(userid)` and a function; `makePostgresListen` is the entrypoint and validates the client.
  - **Set aside: caching the LISTEN's promise per channel** so concurrent first watches share it. It needs a catch to
    clear the cache on failure, and only helps a crossing; the simpler form sends a harmless second LISTEN instead.
* **Library check (for the Coach)**: `pg-listen` (1.7.0, last published 2022-05, about 260k downloads a week) owns
  its own connection made from a config, reconnects, JSON-parses payloads by default, and UNLISTENs a channel for every
  subscriber at once (no count of watches); it would add `pg` as a peer and three runtime dependencies (`debug`,
  `pg-format`, `typed-emitter`). Not added: the refcount layer would still be ours, and the package's promise is no
  runtime dependency but `safebyok`. What we hand-roll is a map of sets over pg's own LISTEN, events and quoting.
* **Discoveries**:
  - The crossing written to `notes/wontfix.md`: two watches asking for a channel nobody holds at once, the first stopped
    before the second's LISTEN returns, sends UNLISTEN after the second's LISTEN, so the second hears nothing.
  - PGlite runs raw `LISTEN`/`UNLISTEN` through `query` and reports through `onNotification`, so the e2e here needs no
    server. A real-Postgres e2e of `makePostgresListen` is D2's (the yoga recipe).
  - The existing `isPostgresQueryable` check in `postgres-vault-db.ts` says its sentence inline, not from `phrases.ts`;
    left as it is (not this thread's file).
