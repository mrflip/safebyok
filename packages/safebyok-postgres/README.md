# safebyok-postgres

safebyok's vaultDB in [Postgres](https://www.postgresql.org): the SQL that makes two tables, and
**`PostgresVaultDB`**, which writes vault and box rows to them from your server. Your database has
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
* **`maxBoxes`**, optional, is a best-effort cap on the live boxes in one vault: a put past it refuses as
  `vault_full`. It is exact at moderate write rates; a strict cap would take concurrency machinery this
  package does not add.
* **`maxRecordBytes`**, optional, as every vaultDB takes it.

`PostgresVaultDB` writes what it is handed under the scope it is handed. **Your route decides who
may reach which bank**: check the signed-in user before a request reaches the vaultDB, and build
each scope's `user_id` from that check, never from the request.

A failed statement refuses as `storage_unavailable`, its cause the driver's message and code; a
missing table or privilege (a code in class `42`) refuses as `unexpected_error`, a fault in setup.

## Hearing other writes

Each write sends a notification on its user's channel, `vaultChannelOf(user_id)`, which is
`safebyok_` and the user_id, as it commits. A vault's notification is its row as stored; a box's
is one JSON array, its vault's fields but the wayins and then its own; a row too long for a
notification is told by where it is, and the listener reads it afresh. `listen(channel, onNotify)`
hands each notification's text on that channel to `onNotify`, as it came, and answers how to stop.
A watch hears a box with a null `world`: the vault's own notifications bring it.

LISTEN needs a connection of its own for as long as it listens, so share one among every watch.
This recipe LISTENs on a channel the first time a watch asks for it and **never UNLISTENs**: the
stop it answers only drops that watch's handler, and the connection stays listening on every
channel it has been asked for until it closes.

```ts
import { Client, escapeIdentifier } from 'pg'
import { type PostgresListen } from 'safebyok-postgres'

const listener = new Client({ connectionString: process.env.DATABASE_URL })
// Unheard, a dropped connection crashes the process; heard, every watch goes quiet until you listen again.
listener.on('error', (err) => { console.warn('safebyok listener lost:', err.message) })
await listener.connect()
const heedersOf = new Map<string, Set<(text: string) => void>>()
listener.on('notification', ({ channel, payload = '' }) => {
  const heeders = heedersOf.get(channel) ?? []
  for (const onNotify of heeders) { onNotify(payload) }
})

const listen: PostgresListen = async (channel, onNotify) => {
  const heeders = heedersOf.get(channel) ?? new Set()
  if (! heedersOf.has(channel)) {
    heedersOf.set(channel, heeders)
    // A user_id has capitals and punctuation that LISTEN reads only in a quoted identifier.
    try {
      await listener.query(`LISTEN ${escapeIdentifier(channel)}`)
    } catch (err) {
      heedersOf.delete(channel)  // so the next watch on this channel LISTENs again
      throw err
    }
  }
  heeders.add(onNotify)
  return () => heeders.delete(onNotify)
}
const vaultDB = new PostgresVaultDB({ client: pgClientOf(pool), listen })
```

A write made just after a watch's first LISTEN can go unheard, as can any notification while the
listener is reconnecting: a watch is a hint, and a device that missed one learns of the write when
it next reads. A PGlite's own `listen` fits as it is, given the channel quoted (`"safebyok_..."`),
but takes its turn behind the statements already queued.

**A user_id whose channel passes 63 bytes cannot write.** A channel is a Postgres identifier, at
most 63 bytes, so a user_id of more than 54 characters (a user_id is ASCII, a byte a character, and
a percent-encoded character is three) makes every write that would send a notice refuse as
`storage_unavailable`, its cause Postgres's `channel name too long`. Keep user_ids to 54 characters
with this package for now.

## What is stored

`safebyok_vaults` has a row per vault, keyed by `applabel`, `user_id` and `vaultlabel`;
`safebyok_boxes` a row per box, keyed by those, the life of its vault (`vault_tok`) and its
`boxlabel`. Each row's record is one `jsonb` column, `vault` or `box`, as safebyok wrote it. A
deleted vault or box leaves its tombstone in place, and `tidyGone` removes the boxes of a vault's
ended lives. Row-level security is on with no policy, so of the roles you grant the tables to,
only their owner, the role your server connects as, reaches the rows; a superuser, or a role that
bypasses row-level security, reaches them too. A notification is not a table: any role that may
connect can LISTEN on any user's channel and hear the rows each write changes.

**You own the database's roles, and are responsible for its row-level security** and for who may
connect and LISTEN: this package grants nothing and creates no role or policy.

Every write locks its vault's row first (`SELECT ... FOR UPDATE`), so writes under one vault take
turns, and a compare-and-set checks the revision of the row it replaces as stored at that moment.

## On Supabase

Supabase is Postgres, so this package runs there as it is: put `vault-tables.sql` in a migration
and run `PostgresVaultDB` on your server, connected with the database connection string.

* **Keep the tables out of the Data API.** The tables come with row-level security on and no
  policy, so the `anon` and `authenticated` roles reach nothing: leave them so.
* **Listen over a direct or session-mode connection.** The transaction-mode pooler (port 6543)
  cannot keep a LISTEN.

This package has not been run against Supabase: this section is a reading of its documentation.

## Developing this package

`pnpm justify` runs its lint, typecheck, tests and build, with publint and arethetypeswrong. The
tests run against [PGlite](https://pglite.dev), a real Postgres compiled to WebAssembly and run
in-process, through the battery every vaultDB runs (`describeVaultDBBattery`, from
`safebyok/testing`), with a second PostgresVaultDB over the same database as another device. The
same battery runs over a real Postgres in `e2e/tests/postgres/`, when `SAFEBYOK_PG_URL` reaches one.
