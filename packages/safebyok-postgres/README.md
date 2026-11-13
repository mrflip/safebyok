# safebyok-postgres

safebyok's bankDB in [Postgres](https://www.postgresql.org): the SQL that makes four tables, and
**`PostgresBankDB`**, which writes bank, gate, vault and box rows to them from your server. Your database has
ciphertext and the few unencrypted fields a row is found by. It never sees a whisper, a passphrase,
or any key that could decipher one.

It brings no driver: it uses the driver you have, a `pg` Pool or a PGlite, and has no runtime
dependency but `safebyok`.

## Install

```sh
pnpm add safebyok safebyok-postgres
```

`safebyok` is a peer dependency, so the adapter and your app share one copy, and a `VaultError`
from one is a `VaultError` to the other.

## Make the tables and the functions

`BankTablesSql` is the SQL of the tables, for Postgres 14 or later. The package also ships it as
`bank-tables.sql`, to copy into your migrations. It creates only what is missing, so it is safe to
run again. Until 1.0 there is no migration: a release that changes the tables says so in its
changelog, and you drop them and run it again.

Each table has a column for each field of a row, and checks each row's shape: its `am`, the columns
a live row has and a tombstone lacks, and the outline of each `jsonb` field. A row they refuse
(SQLSTATE `23514`) is one safebyok could not have read back. They do not check `fmt`: a row in a
later format may sit beside these, and the functions never overwrite it.

`BankFunctionsSql` is the SQL of the functions `PostgresBankDB` calls to write a row, shipped as
`bank-functions.sql`. Run it after the tables, and **again with each upgrade of this package**:
each run replaces the functions. They run with the caller's privileges, and only their owner, the
role that ran the file, may call them. So run both files as the role your pool connects as, or grant
that role `EXECUTE`.

```ts
import { BankFunctionsSql, BankTablesSql } from 'safebyok-postgres'

await pool.query(BankTablesSql)    // pg runs several statements in one query without parameters
await pool.query(BankFunctionsSql)
await pglite.exec(BankTablesSql)
await pglite.exec(BankFunctionsSql)
```

**A database with older safebyok tables**: drop `safebyok_boxes` and `safebyok_vaults`, and each `safebyok_` function,
before you run these files. They create only what is missing, so an older table of the same name stays as it is. The
rows it held are not read: each user's bank starts empty.

## Use

```ts
import { Pool } from 'pg'
import { PostgresBankDB, pgClientOf } from 'safebyok-postgres'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const bankDB = new PostgresBankDB({ client: pgClientOf(pool) })
```

* **`client`** runs a statement (`query`) and a transaction (`transaction`). A PGlite works as it
  is. `pgClientOf(pool)` wraps a `pg` Pool, and runs each transaction on a connection it checks out.
  For any other driver, write a wrapper with the same two functions.
* **`listen`**, optional, is how `watch` hears writes made by other servers and devices; see
  below. Without it, a watch hears nothing, and a device learns of another's writes when it next
  reads.
* **`maxBoxes`**, optional, 100 if left out, is a best-effort cap on the box rows of one vault life. A put of a new box
  past it is refused with `vault_full`. A deleted box's tombstone still counts, so deleting a box frees no room. A vault
  made anew starts at zero. The cap is exact at moderate write rates. A strict cap would take concurrency machinery this
  package does not add.
* **`maxRecordSizeEst`**, optional, as every bankDB takes it: 5,600 bytes if left out, so a box's row fits a `NOTIFY`.

`PostgresBankDB` writes what it is handed under the scope it is handed. **Your route decides who
may reach which bank**: check the signed-in user before a request reaches the bankDB, and build
each scope's `user_id` from that check, never from the request.

A failed statement is refused with `storage_unavailable`, its cause the driver's message and code.
A missing table or privilege (SQLSTATE class `42`) is a setup fault, refused with `unexpected_error`.

## Hearing other writes

Each write sends a notification on its user's channel, `bankChannelOf(user_id)`, which is
`safebyok_` followed by the user_id, as it commits. The database function `safebyok_tell` builds it:
a JSON object with the written row's address under `at`, the row under `row`, and the row above it
under `parent`: a gate's or a vault's bank row, a box's vault row. A box's address carries its
vault's life, `bank_tok` and `vault_tok`. Postgres refuses a notification of 8,000 bytes or more.
A notification that is too large drops the row above first, then the row, and the listener fetches
what is stored at the address. Deleting a bank sends one notification, of its tombstone: the gate,
vault and box rows deleted with it send none. `listen(channel, onNotify)` passes the text of each
notification on that channel to `onNotify`, unchanged, and returns a function that stops listening.
A watch hears a box with its vault's row as its parent, or with a null parent when the vault row did
not fit. A bank or gate row is heard only by a watch of the whole bank. Any role that can connect to the database can `LISTEN` on a channel, and so can read the
rows a notification carries: the same ciphertext and wrapped keys the tables contain.

LISTEN needs a connection of its own for as long as it listens, so share one among every watch.
This recipe LISTENs on a channel the first time a watch asks for it and **never UNLISTENs**. The
stop function it returns only drops that watch's handler, and the connection keeps listening on
every channel it has been asked for until it closes.

```ts
import { Client, escapeIdentifier } from 'pg'
import { type PostgresListen } from 'safebyok-postgres'

const listener = new Client({ connectionString: process.env.DATABASE_URL })
// Without this handler, a dropped connection crashes the process. With it, every watch goes quiet until you listen again.
listener.on('error', (err) => { console.warn('safebyok listener lost:', err.message) })
await listener.connect()
const listenersOf = new Map<string, Set<(text: string) => void>>()
listener.on('notification', ({ channel, payload = '' }) => {
  const listeners = listenersOf.get(channel) ?? []
  for (const onNotify of listeners) { onNotify(payload) }
})

const listen: PostgresListen = async (channel, onNotify) => {
  const listeners = listenersOf.get(channel) ?? new Set()
  if (! listenersOf.has(channel)) {
    listenersOf.set(channel, listeners)
    // A user_id may contain capitals and punctuation, which LISTEN accepts only in a quoted identifier.
    try {
      await listener.query(`LISTEN ${escapeIdentifier(channel)}`)
    } catch (err) {
      listenersOf.delete(channel)  // so the next watch on this channel LISTENs again
      throw err
    }
  }
  listeners.add(onNotify)
  return () => listeners.delete(onNotify)
}
const bankDB = new PostgresBankDB({ client: pgClientOf(pool), listen })
```

A write made just after a watch's first LISTEN can go unheard, as can any notification while the
listener is reconnecting. A watch is only a hint: a device that misses one learns of the write when
it next fetches. A PGlite's own `listen` fits as it is, given the channel quoted (`"safebyok_..."`),
but takes its turn behind the statements already queued.

**A user_id whose channel passes 63 bytes cannot write.** A channel is a Postgres identifier, at
most 63 bytes, so a user_id of more than 54 characters (a user_id is ASCII, a byte a character, and
a percent-encoded character is three) makes every write that would send a notice fail with
`storage_unavailable`, its cause Postgres's `channel name too long`. Keep user_ids to 54 characters
with this package for now.

## What is stored

`safebyok_banks` has a row per bank, keyed by `user_id` and `banklabel`. `safebyok_gates` has a row
per gate of a bank, keyed by those and `gatelabel`; today every bank has one, `main`, holding the
bank's wayins in `wayins`. `safebyok_vaults` has a row per vault, keyed by the bank's key and
`vaultlabel`. `safebyok_boxes` has a row per box, keyed by the vault's key, the life of its vault
(`bank_tok` and `vault_tok`) and its `boxlabel`. Each field of a row is a column of its own. The
labels, the tokens and `am` are `text`. `fmt`, `revision_seq` and `whisper_schema_version` are
`integer`. The times, `registered_at` and `written_at`, are `bigint`, in UTC epoch milliseconds.
A field that is an object is a `jsonb` column: a gate's `wayins`, `auth`, `sigs` and `meta`, and a
box's `sidecar`, `box_key_wrapped` and `whisper_ciphered`. Your own SQL can read any of them, a
sidecar's fields included (`sidecar->>'note'`), but leave the writing to `PostgresBankDB`.

A deleted bank, vault or box leaves its tombstone in place: the same row, its `am` `'x'` where a
live row's is `'a'`, and a box's `jsonb` columns null. Deleting a bank deletes every gate, vault and
box row under it, in the same transaction; building it again does the same to any left. A vault or
box row under another `bank_tok` than its bank row's, or a box row under another life than its
vault row's, is of an ended life: no read returns it, and `tidyGone` deletes it. Each gate, vault
and box row has a foreign key to the bank row at its scope, whatever that bank's `bank_tok`: no row
is stored where no bank row is, and **a `DELETE` of a bank row is refused while rows stand under
it**. `PostgresBankDB` never deletes a bank row, so that is your own SQL's doing, and a `TRUNCATE`
of the banks table must name all four tables.

Row-level security is on with no policy, so of the roles you grant the tables to, only their
owner, the role your server connects as, can reach the rows. A superuser, or a role that bypasses
row-level security, can reach them too. A notification is not a table: any role that may
connect can LISTEN on any user's channel and hear the rows each write changes.

**You own the database's roles, and are responsible for its row-level security** and for who may
connect and LISTEN: this package grants nothing and creates no role or policy.

Each write is one conditional `INSERT` or `UPDATE`, which takes effect only if the stored row still
has the revision the write expects at that moment. A vault write reads its bank row,
and a box write its vault row, without a lock, so writers under one bank do not wait for each other.
A new row's foreign key takes a share lock on its bank row, which waits only on a `DELETE` of that
row. Two things follow:

* A vault or box written while its bank or vault is deleted or built anew may land in the life that
  has ended. No read returns it, and `tidyGone`, or the bank built anew, deletes it. Until then the
  row stays, and it keeps a `DELETE` of its bank row refused. This is accepted: safebyok may later
  offer advice, or functions, that take locks for tighter atomicity under the same contract. If you
  write boxes heavily under vaults that get deleted and are not written again, call `tidyGone` now
  and then.
* The box cap is soft. Writers racing to add their first box can pass it together, and `tidyGone`
  does not trim the rows they add.

## On Supabase

Supabase is Postgres, so this package runs there as it is: put `bank-tables.sql` and
`bank-functions.sql` in a migration and run `PostgresBankDB` on your server, connected with the database connection string.

* **Keep the tables out of the Data API.** The tables come with row-level security on and no
  policy, so the `anon` and `authenticated` roles reach nothing: leave them so.
* **Listen over a direct or session-mode connection.** The transaction-mode pooler (port 6543)
  cannot keep a LISTEN.

This package has not been run against Supabase: this section is a reading of its documentation.

## Developing this package

`pnpm justify` runs its lint, typecheck, tests and build, with publint and arethetypeswrong. The
tests run against [PGlite](https://pglite.dev), a real Postgres compiled to WebAssembly and run
in-process, through the battery every bankDB runs (`describeBankDBBattery`, from
`safebyok/testing`), with a second PostgresBankDB over the same database as another device. The
same battery runs over a real Postgres in `e2e/tests/postgres/`, when `SAFEBYOK_PG_URL` reaches one.
