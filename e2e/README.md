# safebyok-e2e

The checks that pair a storage adapter with a framework's client, end to end: a real client, the
real adapter, the real component, and a fake network. A workspace package that is never
published. It exists so that no adapter lists a framework among its dev dependencies, and so the
pairings, which grow adapter by framework, have one place to live. Heavyweight browser specs
(Playwright and the like) would live here too.

An adapter's own tests stay in its package, so a contributor can run that suite without the
workspace's other packages: `safebyok-convex` runs its battery over `ConvexClient` there. This
package runs the same over what needs a framework.

```sh
pnpm justify    # from e2e/: install, lint, typecheck, test (it builds the packages it reads first)
```

## What is here

* [tests/convex/](tests/convex) -- `safebyok-convex` with `ConvexReactClient`, over the fake
  deployment `safebyok-convex/testing` ships:
  * [convex-vault-db.test.ts](tests/convex/convex-vault-db.test.ts) -- the `VaultDB` battery, the
    refusals, the subscriptions and sign-out, and a vault on two devices (one `ConvexClient`, one
    `ConvexReactClient`), each run over the React client. Its loops are copies of the ones in
    `packages/safebyok-convex/tests/convex-vault-db.test.ts`, which run over `ConvexClient`: a
    change to a looped test is made in both.
  * [test-helpers.ts](tests/convex/test-helpers.ts) -- a host app built from `safebyok-convex`'s
    published entries alone, as a host's own tests would.

* [tests/postgres/](tests/postgres) -- `safebyok-postgres` over a real Postgres through `pg`, with a
  pool and a listening connection to each device, so the statements a race holds and releases run
  on separate connections at once. PGlite, which every test in the adapter's package uses, runs one
  statement at a time and cannot show that. Each file makes a database of its own and drops it.
  * [battery.test.ts](tests/postgres/battery.test.ts) -- the `VaultDB` battery and its races,
    the same `describeVaultDB` the adapter runs over PGlite.
  * [races.test.ts](tests/postgres/races.test.ts) -- writers for a vault's last places, with no
    turnstile: some land, none past the writers racing, every one readable (bounds and read-back,
    not the limit: it is a best effort); and a write that
    counted before another's box committed, which lands past the limit as the README says.
  * [foreign-key.test.ts](tests/postgres/foreign-key.test.ts) -- the `23503` of a vault deleted
    while a box's insert waited on the foreign key, refused as `stale_write`.
  * [test-helpers.ts](tests/postgres/test-helpers.ts) -- the file databases, the devices, and
    **`OnRealPostgres`, the one list of which suites run against the server**; the rest of the
    Postgres tests stay in `packages/safebyok-postgres`, over a PGlite. To run one more suite on the
    server, add it to the list.

The packages are read as a consumer reads them: through their built `dist/`, which the `test`
script builds first, except `safebyok-convex/test`, which ships as source.

## Adding a pairing

A new framework's client goes beside the existing one in the adapter's directory: a `connect`
function for it, and the same tests run over it. A new adapter gets a directory of its own,
`tests/<store>/`, and the fake of its store's network from wherever that adapter ships it. A test
that needs no framework belongs in the adapter's own package.

## Services and Docker

`pnpm justify` needs no Docker. A test that needs a service reads its connection string from the
environment and is skipped where there is none; the Postgres tests read `SAFEBYOK_PG_URL`, and
the account in it must be allowed to `CREATE DATABASE`. [compose.yaml](compose.yaml) is the
services, one to a backend, for a contributor's machine; CI starts the same image as a service
container (the `postgres` job in `.github/workflows/ci.yml`).

```sh
pnpm --filter safebyok-e2e db:up           # postgres:18 on 127.0.0.1:54320
pnpm --filter safebyok-e2e test:postgres   # SAFEBYOK_PG_URL defaults to that container
pnpm --filter safebyok-e2e db:down
```

To run against a Postgres of your own, set `SAFEBYOK_PG_URL` and run `pnpm test` in this directory
(or `test:postgres`, which runs only these). The compose file has slots, as comments, for the
backends to come: Convex's local backend next. A browser (Playwright) is not a service: when its
specs are built they get a job of their own.
