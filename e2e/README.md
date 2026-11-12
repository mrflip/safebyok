# safebyok-e2e

The checks that pair a storage adapter with a framework's client, end to end: a real client, the
real adapter, the real component, and a fake network. A workspace package that is never
published. It exists so that no adapter lists a framework among its dev dependencies, and so the
pairings, one for each adapter and framework, have one place to live. Heavyweight browser specs
(Playwright and the like) would live here too.

An adapter's own tests stay in its package, so a contributor can run that suite without the
workspace's other packages: `safebyok-convex` runs its battery over `ConvexClient` there. This
package runs the same tests over the clients that need a framework.

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
  pool and a listening connection for each device, so the statements in a race run at the same
  moment on separate connections. PGlite, which every test in the adapter's package uses, runs one
  statement at a time and cannot show that. Each file makes a database of its own and drops it.
  * [battery.test.ts](tests/postgres/battery.test.ts) -- the bankDB battery and its races,
    the same `describeBankDBBattery` the adapter runs over PGlite, and a watch hearing another
    server's writes through a real `LISTEN`.
  * [races.test.ts](tests/postgres/races.test.ts) -- writers racing for a vault's last place, each
    on its own pool. The cap is soft: at least one racer is written, and the rest are refused as
    full. A box written into a vault life being deleted is never listed, and `tidyGone` deletes it.
  * [test-helpers.ts](tests/postgres/test-helpers.ts) -- the file databases, the devices, and
    **`OnRealPostgres`, the list of suites that run against the server**. The rest of the
    Postgres tests stay in `packages/safebyok-postgres`, over a PGlite. To run one more suite on the
    server, add it to the list. A file database holds the bankDB's tables, or, for
    `tests/graphql/`, the vaultDB's: their functions share names.

* [tests/graphql/](tests/graphql) -- `safebyok-graphql`'s README recipe, both halves, over real
  sockets: `GraphQLVaultDB` over an urql Client posting to Yoga servers, each on its own port and
  hosting a `PostgresVaultDB` over the real Postgres above. It runs where the Postgres tests do, as
  `graphql` in `OnRealPostgres`.
  * [graphql-bank-db.test.ts](tests/graphql/graphql-bank-db.test.ts) -- the `VaultDB` battery
    through the network, a browser on one server receiving what a browser on another server puts,
    the server's watch ending when the browser stops watching, and the refusal of a browser signed
    in as another user.
  * [test-helpers.ts](tests/graphql/test-helpers.ts) -- the servers and the browsers, over the
    databases and `PostgresVaultDB`s that the Postgres directory's helpers make.

The packages are read as a consumer reads them: through their built `dist/`, which the `test`
script builds first, except `safebyok-convex/test`, which ships as source.

## Adding a pairing

A new framework's client goes beside the existing one in the adapter's directory: a `connect`
function for it, and the same tests run over it. A new adapter gets a directory of its own,
`tests/<backend>/`, and the fake of its backend's network from wherever that adapter ships it. A test
that needs no framework belongs in the adapter's own package.

## Services and Docker

`pnpm justify` needs no Docker. A test that needs a service reads its connection string from the
environment and is skipped when there is none. The Postgres tests read `SAFEBYOK_PG_URL`, and
the account in it must be allowed to `CREATE DATABASE`. [compose.yaml](compose.yaml) defines the
services, one for each backend, for a contributor's machine, and CI starts the same image as a service
container (the `postgres` job in `.github/workflows/ci.yml`).

```sh
pnpm --filter safebyok-e2e db:up           # postgres:18 on 127.0.0.1:54320
pnpm --filter safebyok-e2e test:postgres   # SAFEBYOK_PG_URL defaults to that container
pnpm --filter safebyok-e2e db:down
```

Inside the dev container there is nothing to start: its Postgres runs beside it
([.devcontainer/services.yaml](../.devcontainer/services.yaml), extended from this compose file),
and `SAFEBYOK_PG_URL` is set to it, so `pnpm test` here runs the Postgres tests too. Every worktree
in the container shares that server, and each test file uses a database of its own.

To run against a Postgres of your own, set `SAFEBYOK_PG_URL` and run `pnpm test` in this directory
(or `test:postgres`, which runs only these). The compose file has slots, as comments, for the
backends to come: Convex's local backend next. A browser (Playwright) is not a service: when its
specs are built they get a job of their own.
