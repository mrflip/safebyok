# safebyok-postgres

safebyok's vaultDB in [Postgres](https://www.postgresql.org): the SQL that makes two tables and the functions that
write to them, and **`PostgresVaultDB`**, which reads and writes a bank's Things there from your server. Your database has
ciphertext and the few unencrypted fields a row is found by. It never sees a whisper, a passphrase, or any key that
could decipher one.

It brings no driver: it uses the driver you have, a `pg` Pool or a PGlite, and has no runtime dependency but
`safebyok`.

## Install

```sh
pnpm add safebyok safebyok-postgres
```

`safebyok` is a peer dependency, so the adapter and your app share one copy, and a `VaultError` from one is a
`VaultError` to the other.

## Make the tables and the functions

`VaultTablesSql` is the SQL of the tables, for Postgres 14 or later. It creates only what is missing, so it is safe to
run again. Until 1.0 there is no migration: a release that changes the tables says so in its changelog, and you drop
them and run it again. Each table has a column for each field of a Thing, and checks each row's shape on its own; a row
it refuses (SQLSTATE `23514`) is one safebyok could not have read back.

`PostgresVaultDB` needs **Postgres 18 or later**: each statement it runs dates its read with Postgres's own `uuidv7()`,
so the time an answer was read is the database's, never the device's.

`VaultFunctionsSql` is the SQL of the functions `PostgresVaultDB` calls, for Postgres 18 or later. Run it after the
tables, and **again with each upgrade of this package**, which replaces the functions it made. Until 1.0 a function
keeps its name across releases: a release that changes a function's arguments or result says so in its changelog, and
you drop that function first, since Postgres will not replace it in place. The functions run with the caller's
privileges, and only their owner, the role that ran the SQL, may call the ones that write a Thing or notify a watch. So
run both as the role your server connects as, or grant that role `EXECUTE` on them.

```ts
import { VaultFunctionsSql, VaultTablesSql } from 'safebyok-postgres'

await pool.query(VaultTablesSql)    // pg runs several statements in one query without parameters
await pool.query(VaultFunctionsSql)
await pglite.exec(VaultTablesSql)
await pglite.exec(VaultFunctionsSql)
```

## Use

```ts
import { Pool } from 'pg'
import { PostgresVaultDB } from 'safebyok-postgres'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const vaultDB = new PostgresVaultDB({ client: pool })
```

* **`client`** runs a statement: anything with `query(text, params)` that resolves to `{ rows }`, as a `pg` Pool, a
  `pg` connection and a PGlite do.
* **`listen`**, optional, is how `watch` hears writes made by other servers and devices; see below. Without it, a watch
  hears nothing, and a device learns of another's writes when it next reads.

`PostgresVaultDB` writes what it is handed under the scope it is handed. **Your route decides who may reach which
bank**: check the signed-in user before a request reaches the vaultDB, and build each scope's `userid` from that check,
never from the request.

## When a statement fails

A failed statement that a retry may mend is refused with `storage_unavailable`: a lost or refused connection, a
serialization failure or deadlock, a server short of resources or shutting down, a lock not granted in time, a write
sent to a server that is read-only for now, as during a failover (SQLSTATE classes `08`, `40`, `53`, `57`, and `55P03`
and `25006`). A lost or refused connection is also told by a Node system error code such as `ECONNRESET`, or by `pg`'s
own message for one; a wrapper for another driver passes it on with a SQLSTATE or a Node code as the error's `code`.

Every other failed statement, a missing table or privilege among them, is refused with `storage_issue`: a retry would
fail the same way, and the database needs your attention. Its message names the call that failed (`getThing`,
`writeThing`, and so on).

Either way the refusal's `cause` is an `Error` with the driver's message and its `code`, and nothing else the driver
attached: a `pg` error can carry the statement's parameters, and so a row.

## Hearing other writes

Each write notifies on its user's channel, `thingsChannelOf(userid)`, which is `safebyok_things_` followed by the
userid, as it commits: a JSON object with the Thing's scope (its `modelkind`, `userid`, `banklabel` and `labelpath`)
under `at`, the Thing under `thing`, and its bank's part under `bank`: the `banktok`, `labelpath`, `lifepath`, `revseq`
and `revtok` of the bank's gate, never its wayins. Postgres refuses a notification of 8,000 bytes or more; one that is
too large drops the Thing and the bank's part, and the watch fetches them. Any role that can connect to the database can `LISTEN` on a
channel, and so can read the Things a notification carries: the same ciphertext and wrapped keys the tables contain.

`listen(channel, onNotify)` passes the text of each notification on that channel to `onNotify`, unchanged, and returns
a function that stops listening. LISTEN needs a connection of its own for as long as it listens, so share one among
every watch. **`makePostgresListen(client)`** makes that listen on a `pg` `Client` you connect for it: it LISTENs on a
channel the first time a watch asks for it, passes each notification to every watch on its channel, and UNLISTENs once
the last of them stops.

```ts
import { Client, Pool } from 'pg'
import { PostgresVaultDB, makePostgresListen } from 'safebyok-postgres'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const listener = new Client({ connectionString: process.env.DATABASE_URL })
// Without this handler, a dropped connection crashes the process. With it, every watch goes quiet and each new watch
// ends: connect a new Client, and make a new vaultDB with it.
listener.on('error', (err) => { console.warn('safebyok listener lost:', err.message) })
await listener.connect()
const vaultDB = new PostgresVaultDB({ client: pool, listen: makePostgresListen(listener) })
```

A failed LISTEN ends the watch that asked for it, and a failed UNLISTEN reaches the stopped watch's `onBadNews`, as below;
the next watch on that channel LISTENs again. For another driver, write a `listen` of your own to the same contract.

A write made just after a watch's first LISTEN can go unheard, as can any notification while the listener is
reconnecting. A watch is only a hint: a device that misses one learns of the write when it next fetches. A PGlite's own
`listen` fits as it is, given the channel quoted (`"safebyok_things_..."`).

**How a watch ends.** `vaultDB.watch(scope, onNotice, onBadNews, onEnded)` listens until you call the stop function it
returns, or until it ends of itself:

* **A notification whose fetch fails** in a way a retry may mend is dropped, and the watch listens on. Any other failure ends
  the watch: it calls `onEnded`, then `onBadNews` with the refusal, and listens no more.
* **A `listen` that fails** ends the watch the same way, once `watch` has returned: `onEnded`, then `onBadNews`.
* **An unlisten that fails**, the function your `listen` returned throwing or rejecting, is handed to `onBadNews`. It
  does not call `onEnded`, since the watch was ending anyway; in a watch that ended of itself, it still reaches
  `onBadNews`, after `onEnded` and the bad news that said why.

A watch calls `onEnded` at most once, and unlistens once, however many of these happen. A watch stopped before its
`listen` resolves still unlistens, once it does.

**A userid whose channel passes 63 bytes cannot write.** A channel is a Postgres identifier, at most 63 bytes, so a
userid of more than 47 bytes makes every write fail with `storage_issue`, its cause Postgres's
`channel name too long`. Keep userids to 47 bytes with this package for now.

## What is stored

`safebyok_gate_things` has a row per bank, its gate, stored at the banklabel, and `safebyok_box_things` a row per
box, each keyed by the rest of a Thing's scope, `userid`, `banklabel` and `labelpath`. Each field of a Thing is a column of its own, and a `CHECK`
fixes each table's `modelkind` column to its kind; a field that is
an object is a `jsonb` column. Every text column is `COLLATE "C"`, compared and sorted byte for byte, as safebyok
compares names. Each time is a `bigint` in UTC epoch milliseconds. Your own SQL can read any of them, but leave the
writing to `PostgresVaultDB`.

A deleted Thing leaves its tombstone in place: the same row, its `am` `'x'` where a live row's is `'a'`. Each write is
one statement, which takes effect only if the row still has the revision the write cites, and waits only on a
writer of the same row. No table has a foreign key.

Row-level security is on with no policy, so of the roles you grant the tables to, only their owner, the role your server
connects as, can reach the rows. A superuser, or a role that bypasses row-level security, can reach them too. A
notification is not a table: any role that may connect can LISTEN on any user's channel and hear each Thing
written.

**You own the database's roles, and are responsible for its row-level security** and for who may connect and LISTEN:
this package grants nothing and creates no role or policy.

## On Supabase

Supabase is Postgres, so this package runs there as it is: run `VaultTablesSql` and `VaultFunctionsSql` in a migration
and run `PostgresVaultDB` on your server, connected with the database connection string.

* **Keep the tables out of the Data API.** The tables come with row-level security on and no policy, so the `anon` and
  `authenticated` roles reach nothing: leave them so.
* **Listen over a direct or session-mode connection.** The transaction-mode pooler (port 6543) cannot keep a LISTEN.

This package has not been run against Supabase: this section is a reading of its documentation.

## Developing this package

`pnpm justify` runs its lint, typecheck, tests and build, with publint and arethetypeswrong. The tests run against
[PGlite](https://pglite.dev), a real Postgres compiled to WebAssembly and run in-process, through the battery every
vaultDB runs (`describeVaultDBBattery`, from `safebyok/testing`).
