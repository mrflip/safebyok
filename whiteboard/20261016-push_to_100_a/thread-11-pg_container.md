# Thread 11: pg_container (2026-10-16)

Branch `20261016-pg_container`, PR [#131](https://github.com/mrflip/safebyok/pull/131), cut from `main` (`f63bd915`). Justify: green locally (Docker-free; e2e 85 passed, 93 skipped). CI on the PR: `postgres` job green on a real `postgres:17` (4 files, 79 tests passed, 3 skipped + 1 todo as in the PGlite run); `lint-typecheck`, `test-build`, `node-compat (26)`, CodeQL green; `node-compat (22)` failed once on a `safebyok-react` timing test unrelated to this thread (`vault-provider.test.tsx`, "opens again ... made anew"); it passed on rerun.

* **Built**
  * `e2e/tests/postgres/`: `battery.test.ts` (the `describeVaultDB` battery with `makeDevices`, a `pg` Pool and a listening connection to each device, plus the turnstile self-test), `races.test.ts` (eight devices for a vault's last place with no turnstile, five rounds; a write that counted before another's lockbox committed, landing past the limit, deterministically), `foreign-key.test.ts` (a device's insert held at its foreign key check by another connection's uncommitted `DELETE` of the bundle, then the erase commits: `stale_write`; rolled back: lands), `hard-cap.test.ts` (the README's trigger SQL read from the README itself, under READ COMMITTED, REPEATABLE READ, SERIALIZABLE).
  * `test-helpers.ts`: a database per test file (`CREATE DATABASE`, dropped after; so files run side by side without sharing tables or the `NOTIFY` channel), `deviceOver`, `devicesOver`, `listenOver` (the README's one-connection recipe), and **`OnRealPostgres`, the one list of suites that run on the server**, read by `describeOnPostgres`. Skipped when `SAFEBYOK_PG_URL` is unset.
  * `e2e/compose.yaml` (one service, `postgres:17` pinned by digest, trust auth on `127.0.0.1:54320`, slots for Convex's local backend and later stores as comments); scripts `test:postgres`, `db:up`, `db:down`; the `postgres` job in `ci.yml` (own block at the end, action hashes copied from the existing jobs); a Dependabot `docker-compose` entry for `/e2e`.
  * Docs: `e2e/README.md` (the files, the services, Docker), VAULTDB.md *Proving the races*, `safebyok-postgres` README (the hard-cap paragraph), `notes/security.md` (the passwordless container, the digest), an empty changeset.
* **Decisions taken**
  * Suites on the container: battery, races, hard cap, foreign key (the preplan's default); everything else stays over PGlite in `packages/safebyok-postgres`.
  * `pg` and `@types/pg` are dev dependencies of the private `e2e` package (said here, as PROCESS.md asks); `@types/pg` was already the adapter's.
  * One database per test file rather than a schema: `NOTIFY` channels are per database, and the battery's push tests would hear another file's writes. The account needs `CREATEDB`.
  * The overshoot is proved by a raw uncommitted transaction (a lockbox copied through a temp table, naming no column, so thread 2's `note` removal needs no edit) rather than by luck of timing; the all-at-once rounds assert only bounds (RC with the trigger: exactly one lands).
  * SERIALIZABLE under the trigger is asserted loosely (landed, or `storage_unavailable`): which one is the server's serialization to say. Observed locally (Postgres 18 beta): it landed. REPEATABLE READ overshoots by one, as the README says; READ COMMITTED refuses as `storage_unavailable`, as the README says.
  * No password: `trust` on loopback / the runner alone, so no credential is in the repo.
* **Deviations**
  * "Widening to every Postgres test is a one-line change" holds for the e2e suites only. The adapter's own tests (`packages/safebyok-postgres/tests/`) are written against a PGlite (`exec`, `transaction`, `listen`, `TRUNCATE`); running them on a server needs a PGlite-shaped wrapper over a `pg` Pool first. I did not build it; it is the natural next step if the Coach wants it.
  * The `postgres` job is not added to the ruleset (the Coach's hand).
* **Discoveries**
  * The battery and every race passed on a real server on the first run, including the turnstile holds (one device per pool). The adapter's `stale_write` for `23503` does not keep a `cause`, so the foreign key test cannot assert the code; it is the only way the held insert can refuse (the count saw the vault standing).
  * No Docker in the worker's container: verified locally against `embedded-postgres` 18 beta binaries installed in the scratchpad (not in the repo); the proof of record is CI on `postgres:17`.
  * The image digest is written twice (compose, workflow); Dependabot moves the compose one only.
* **For the Coach**
  * Is `postgres` to become a required check, once it has run a while?
  * Rows: **G203 closed** (code: `e2e/tests/postgres/`, `ci.yml`; docs: VAULTDB.md, e2e README). **G288 closed** (`races.test.ts`, `foreign-key.test.ts`, `hard-cap.test.ts`; the README's hard-cap paragraph points at them). **G524 not closed**: its Postgres half is done (compose file, service container, `e2e/` owns it, the suites are one list), but Convex's local backend and the other backends are slots, not services, and the question of PGlite-shaped adapter tests on a server stays open.
  * Answers to the Coach's side questions: the other backends go on the same compose file, one service each; Playwright gets its own job, written in `e2e/README.md`.
