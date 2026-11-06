# safebyok-postgres

safebyok's vaultDB in [Postgres](https://www.postgresql.org): the SQL that makes two tables, and
**`PostgresVaultDB`**, which stores vault and box rows in them from your server. Your database holds
ciphertext and the few plain fields a row is found by; it never sees a whisper, a passphrase, or a
key that opens one.

It brings no driver: it speaks through the one you have, a `pg` Pool or a PGlite, and has no runtime
dependency but `safebyok`.

## Install

```sh
pnpm add safebyok safebyok-postgres
```

`safebyok` is a peer dependency, so the adapter and your app share one copy, and a `VaultError`
from one is a `VaultError` to the other.

## Make the tables

`VaultTablesSql` is the SQL, for Postgres 14 or later; the package also ships it as
`vault-tables.sql`, to copy into your migrations. It creates only what is missing, so it is safe to
run again. Until 1.0 there is no migration: a release that changes the tables says so in its
changelog, and you drop them and run it again.

```ts
import { VaultTablesSql } from 'safebyok-postgres'

await pool.query(VaultTablesSql)    // pg runs several statements in one query without parameters
await pglite.exec(VaultTablesSql)
```

## Use

```ts
import { Pool } from 'pg'
import { PostgresVaultDB, pgClientOf } from 'safebyok-postgres'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const vaultDB = new PostgresVaultDB({ client: pgClientOf(pool) })
```

* **`client`** runs a statement (`query`) and a transaction (`transaction`). A PGlite is one as it
  is; `pgClientOf(pool)` makes one of a `pg` Pool, running each transaction on a connection it
  checks out. Any other driver takes a wrapper of the same two functions.
* **`listen`**, optional, is how `watch` hears writes made by other servers and devices; see
  below. Without it, a watch hears nothing, and a device learns of another's writes when it next
  reads.
* **`maxBoxes`**, optional, caps the live boxes in one vault; a put past it refuses as `vault_full`.
* **`maxRecordBytes`**, optional, as every vaultDB takes it.

`PostgresVaultDB` stores what it is handed under the scope it is handed. **Your route decides who
may reach which bank**: check the signed-in user before a request reaches the vaultDB, and build
each scope's `user_id` from that check, never from the request.

A failed statement refuses as `storage_unavailable`, its cause the driver's message and code; a
missing table or privilege (a code in class `42`) refuses as `unexpected_error`, a fault in setup.

## Hearing other writes

Each write sends a notification on `VaultChangeChannel` as it commits, carrying the rows it stored
(or, for rows too long for a notification, where they are, which the listener reads afresh).
`listen(channel, onNotify)` hands each notification's text to `onNotify` and answers how to stop.
LISTEN needs a connection of its own for as long as it listens, so share one among every watch:

```ts
import { Client } from 'pg'
import { VaultChangeChannel, type PostgresListen } from 'safebyok-postgres'

const listener = new Client({ connectionString: process.env.DATABASE_URL })
// Unheard, a dropped connection crashes the process; heard, every watch goes quiet until you listen again.
listener.on('error', (err) => { console.warn('safebyok listener lost:', err.message) })
await listener.connect()
await listener.query(`LISTEN ${VaultChangeChannel}`)
const heeders = new Set<(text: string) => void>()
listener.on('notification', ({ payload }) => { for (const onNotify of heeders) { onNotify(payload ?? '') } })

const listen: PostgresListen = (_channel, onNotify) => {
  heeders.add(onNotify)
  return () => heeders.delete(onNotify)
}
const vaultDB = new PostgresVaultDB({ client: pgClientOf(pool), listen })
```

A PGlite's own `listen` fits as it is, but takes its turn behind the statements already queued, so
a write made just after a watch begins can go unheard.

## What is stored

`safebyok_vaults` holds a row per vault, keyed by `applabel`, `user_id` and `vaultlabel`;
`safebyok_boxes` a row per box, keyed by those, the life of its vault (`vault_tok`) and its
`boxlabel`. Each row's record is one `jsonb` column, `vault` or `box`, as safebyok wrote it. A
deleted vault or box leaves its tombstone in place, and `tidyGone` removes the boxes of a vault's
ended lives. Row-level security is on with no policy, so only the tables' owner, the role your
server connects as, reaches them.

Every write locks its vault's row first (`SELECT ... FOR UPDATE`), so writes under one vault take
turns, and the checks a write makes before it lands read rows no other write can change meanwhile.

## On Supabase

Supabase is Postgres, so this package runs there as it is: put `vault-tables.sql` in a migration
and run `PostgresVaultDB` on your server, connected with the database connection string.

* **Keep the tables out of the Data API.** The tables come with row-level security on and no
  policy, so the `anon` and `authenticated` roles reach nothing: leave them so.
* **Listen over a direct or session-mode connection.** The transaction-mode pooler (port 6543)
  cannot hold a LISTEN.

This package has not been run against Supabase: this section is a reading of its documentation.

## Developing this package

`pnpm justify` runs its lint, typecheck, tests and build, with publint and arethetypeswrong. The
tests run against [PGlite](https://pglite.dev), a real Postgres compiled to WebAssembly and run
in-process, through the battery every vaultDB runs (`describeVaultDBBattery`, from
`safebyok/testing`), with a second PostgresVaultDB over the same database as another device. The
same battery runs over a real Postgres in `e2e/tests/postgres/`, when `SAFEBYOK_PG_URL` reaches one.
