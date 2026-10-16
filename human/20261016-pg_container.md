# 2026-10-16: pg_container filed -- the Postgres battery and races run on a real server in CI

[#131](https://github.com/mrflip/safebyok/pull/131): `e2e/tests/postgres/` (battery, races, the `23503` case, the README's hard-cap trigger under three isolation levels), `e2e/compose.yaml`, a `postgres` CI job on `postgres:17`. Closes G203 and G288; the Postgres half of G524. Thread file: `whiteboard/20261016-push_to_100_a/thread-11-pg_container.md`.

## Rulings

* *Should the `postgres` job become a required check?* A TODO entry, which the orchestrator files.
* *Other backends on the same compose file, Playwright its own job?* "Thanks, noted."

## Still open

* Six review minors, left on purpose (retitle the all-at-once tests to what they prove; `untilStatementBlocked` accepts any lock wait; the digest is written twice; the CI service publishes 5432 on all runner interfaces; no `error` listeners on `pg` pools and clients; `randomBytes` names the file databases).
* A PGlite-shaped wrapper over a `pg` Pool, so the adapter's own tests can run on the container.
