# Thread F: postgres_standalone (2026-11-25)

Branch `20261125-postgres_standalone`, PR #930, stacked on #923. Proved: `pnpm justify` green after the catch-up
(safebyok-postgres 170 tests, the core 2318).

* **Built**:
  - `packages/safebyok-postgres/src/postgres-driver.ts` is gone. Its pieces now live in the files that own them:
    - `src/refusals.ts`: `refusalOf(oplabel, thrown)`, its transient tables, `PgConnectionLost` and `storedNothing`.
    - `src/notifications.ts`: `thingsChannelOf`, `ThingNotification` and `thingNotificationOf`.
    - `src/postgres-vault-db.ts`: the options types and their checker, the row types, and the listen and unlisten plumbing,
      as `startListening` and `stopListening`.
  - The exports are unchanged: `PostgresVaultDB`, `PostgresListen`, `PostgresQueryable`, `PostgresVaultDBOpts`,
    `thingsChannelOf` and the two SQL strings.
  - **A lasting failure refuses `storage_issue`.** It comes from the core's `storageCallRefused`, through an
    `answerForThrown` override, so `#queryRow` (formerly `#firstRow`) no longer catches just to rethrow. A transient
    failure still refuses `storage_unavailable`, and a cause still keeps only the message and the code.
  - **`onEnded`.** In the core, `AdapterVaultDB.watch` now takes `onEnded` and hands it to `doWatch`; it was dropped before.
    A Postgres watch that ends of itself calls `onEnded`, then `onBadNews`. It ends of itself when a fetch fails in a way
    a retry would not mend, or when the host's `listen` fails. Either way this happens after `watch` returns, because
    `startListening` awaits a tick first.
  - **A failed unlisten goes to `onBadNews`** (the Coach: "yes for onbadnews for the watch").
  - The README was rewritten in its failure and watch sections, and drops the paragraph on postgres-big's tables.
  - The `notes/wontfix.md` row "A Convex or Postgres watch's result, notice or failure that lands after its watch is
    stopped" was brought up to date.
  - The tests: `tests/refusals.test.ts` (it was `postgres-driver.test.ts`), the new `tests/notifications.test.ts`, and
    new watch tests in `tests/postgres-vault-db.test.ts`.
* **Decisions made**:
  - **One `isWatching` flag.** It gives the one unlisten, the one `onEnded` and the one ending bad news. As a side effect,
    a second fetch failure is dropped, and so is a failure that lands after the stop. This reverses #923's
    changeset line "two notices' fetches that fail together ... now each tell `onBadNews`", because the #926 contract
    calls `onEnded` once, before the bad news that says why. Notices are still unguarded (`#no-slop-crossings`).
  - **A failed listen ends the watch.** It is classified like any other failure, so a transient one ends the watch as
    `storage_unavailable`, since there is nothing left to listen with.
  - **The order of an unlisten failure.** After a self-end, an unlisten failure reaches `onBadNews` after the bad news
    that said why, and so after `onEnded`. The Coach ruled (2026-11-25) that news may follow `onEnded`, and the
    `VaultDB.watch` doc, the OneWatchVaultDB doc and the README now say so.
  - **Names.** `Told`/`toldOf` were renamed `ThingNotification`/`thingNotificationOf`, because VOCABULARY keeps
    tell and hear for the VaultMinder.
  - `storedNothing` stays `unexpected_error`, as the handoff said (Closer Look E2).
* **Deviations**:
  - **A core change.** It is in `packages/safebyok/src/storage/adapter-vault-db.ts`, as a commit of its own. Without it,
    no adapter's `doWatch` can see `onEnded`. Thread E (convex_deltas) may want or make the same change.
* **Discoveries**:
  - Old CHANGELOG entries say 42501 maps to `not_permitted`. This package refuses it as `storage_issue`, as it refused it
    `unexpected_error` before.
  - The `notes/wontfix.md` row "Two Postgres lists whose `read_tc` order..." says the package supports Postgres before 18.
    The README says 18 or later. I did not touch the row.
* **For the Coach**:
  - Should the package export a ready-made `PostgresListen` for a `pg` Client (the README's recipe)? Thread D will need one.
