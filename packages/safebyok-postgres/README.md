# safebyok-postgres

safebyok's storage in [Postgres](https://www.postgresql.org): the SQL that makes the tables a
vault is stored in, and **`postgresVaultDB`**, the VaultDB over them, which runs on your server.
Your database holds ciphertext and a few unencrypted fields; it never sees a whisper, a passphrase, or
any key that opens one.

It brings no database driver: it speaks through the one you already have -- a `pg` Pool, a
PGlite, postgres.js behind a one-line wrapper -- and has no runtime dependency but `safebyok`.

## Install

```sh
pnpm add safebyok safebyok-postgres
```

`safebyok` is a peer dependency: your app installs it, so the adapter and your app share one
copy, and a `VaultError` from one is a `VaultError` to the other.

Platform: Node 22 and up, wherever your server runs it; the floor is stated in the core's *Where it
runs*.

## Make the tables

`VaultTablesSql` is the SQL, for Postgres 14 or later in a UTF8 database. The package also ships
it as `vault-tables.sql`, to copy into your migrations. It is safe to run again: it creates only
what is missing.

```ts
import { VaultTablesSql } from 'safebyok-postgres'

await pool.query(VaultTablesSql)    // pg runs several statements in one query without parameters
await pglite.exec(VaultTablesSql)   // PGlite
```

That is tables, columns, keys and row-level security, and nothing more: no trigger, no function, no
extra table, nothing to keep in step. Push between devices is opt-in; see *Hearing other writes*.

For your app's own tests, the same SQL on [PGlite](https://pglite.dev), in-process, is the whole
backend: a PGlite is a `client` as it stands, so there is no fake to install, as there is for
Convex (`safebyok-convex/testing`). This package's own tests run that way.

## Where it runs

Postgres has nowhere to run a vault's verbs, and the vault itself runs in the browser. So
`postgresVaultDB` runs on your server, **made per request for the signed-in user**, and your
route layer carries its verbs to a VaultDB in the browser (the recipe below), or a GraphQL server
does (`safebyok-graphql`).

```ts
import { postgresVaultDB } from 'safebyok-postgres'

const vaultDB = postgresVaultDB({ client: pool, userId: session.userId })
```

* **`userId`** is the user your own auth signed in for this request -- from its verified session,
  never from anything the browser sends -- or `null` when no one is. The VaultDB reaches only that
  user's vaults: a verb naming any other user's scope, or any at all while signed out, refuses
  with a `VaultError` of kind `identity_revoked` before the database is asked anything, and the
  browser's vault, opened for a user no longer signed in, locks itself. A refusal of your own for
  a user who is signed in but may not make a call is kind `not_permitted`, which locks nothing.
* **`client`** is anything with `query(text, params)` resolving to `{ rows }`: a `pg` Pool,
  Client or PoolClient, or a PGlite, as they stand. postgres.js takes a wrapper:
  `{ query: async (text, params) => ({ rows: await sql.unsafe(text, params) }) }`.
* **Every write is one statement**, atomic as Postgres makes every statement, so it asks no
  transaction of your driver and no retry: a write lands only while what it expects still
  stands, and refuses with kind `stale_write` otherwise. A lockbox write reads its vault row
  `FOR SHARE`, a shared lock: lockbox writes never wait for each other on the vault row (two
  writes to one boxlabel still meet at that lockbox's row), and an update of the vault props waits
  for the lockbox writes under way (or they for it), so a lockbox lands only under the vaultKey
  that stands.
* **Isolation**: every guarantee here holds under READ COMMITTED, Postgres's default. Above it --
  a session default of REPEATABLE READ or SERIALIZABLE, or your own transaction around a call --
  some races fail with a serialization error (`40001`) instead, which refuses as
  `storage_unavailable` and may simply be tried again. Leave the isolation level alone, and no
  verb needs a retry.
* **`maxLockboxes`**, none (`Infinity`) unless you say otherwise, is the most lockboxes one vault
  holds, as a best effort: see *A limit of the server's own*, below. Quotas are yours to set.
* **`logger`**, when given, hears what the VaultDB has to say: a `listen` that failed to start, an
  unlisten that failed, a subscriber that threw. Left out, it is the console's.
* **Names of up to 640 bytes** of UTF-8 each (`maxNameBytes`): a lockbox's primary key is its
  four names together, and Postgres holds a btree entry of at most 2704 bytes. A longer name is
  refused with kind `bad_label` before a statement runs. No character is reserved: each name is
  a column of its own.
* **What the server checks** is who may reach which vault, that each write is atomic, and that
  each record has its shape and each name is above the floor (`VAULTDB.md`, *Names*) and within
  the limit above: the same checks every VaultDB's verbs make, on the server side of the wire.
  It never holds a name to a label grammar, nor looks inside a lockbox's sidecar: the one is
  each browser vault's own `validators`, checked where a name enters it, the other the host's.
  A host whose clients run different validators has chosen that, and a client reads a record
  another's validators let through as any other, never as damage.
* **Trouble** refuses with kind `storage_unavailable`, your driver's own error as its `cause`.
  Every refusal is a `VaultError`, and its `kind` and message are safe to send to the browser;
  its `cause` is not, being your driver's, and may name your database.

## The route recipe

One POST route serves every verb, and the browser's VaultDB posts to it. This is web-standard
`Request` and `Response`, so it is a Next.js route handler as it stands, and a Hono, Bun or Deno
handler with its export renamed. The package's tests run this recipe whole
(`tests/route-recipe.test.ts`), against the same suite every VaultDB passes.

The server half, `app/api/safebyok/route.ts`:

```ts
import { Pool } from 'pg'
import { VaultError } from 'safebyok'
import type { VaultPropsExpectation, RetireExpectation, Lockbox, LockboxExpectation, LockboxRetireExpectation, VaultProps, VaultScope } from 'safebyok'
import { postgresVaultDB } from 'safebyok-postgres'
import type { VaultDB } from 'safebyok'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

type Served = (vaultDB: VaultDB, args: unknown[]) => Promise<unknown>

// The verbs a browser's vault may call -- VaultDB's own, and nothing else -- each passed to the
// VaultDB, which refuses another user's vault, and holds each record to its shape and each name
// to the floor and the table's limits; what text a name may be beyond that is each browser
// vault's own validators' to say. A listing goes as the stored records, which the browser's
// VaultDB validates.
const served = new Map<string, Served>([
  ['readVaultProps',   (vaultDB, [scope]) => vaultDB.readVaultProps(scope as VaultScope)],
  ['fetchOrCreateVaultProps', (vaultDB, [vaultProps]) => vaultDB.fetchOrCreateVaultProps(vaultProps as VaultProps)],
  ['updateVaultProps', (vaultDB, [vaultProps, expected]) => vaultDB.updateVaultProps(vaultProps as VaultProps, expected as VaultPropsExpectation)],
  ['readBox',      (vaultDB, [scope, boxlabel]) => vaultDB.readBox(scope as VaultScope, boxlabel as string)],
  ['listBoxes',    (vaultDB, [scope]) => vaultDB.listBoxRecords(scope as VaultScope)],
  ['updateBox',    (vaultDB, [scope, lockbox, expected]) => vaultDB.updateBox(scope as VaultScope, lockbox as Lockbox, expected as LockboxExpectation)],
  ['retireBox',     (vaultDB, [scope, boxlabel, expected]) => vaultDB.retireBox(scope as VaultScope, boxlabel as string, expected as LockboxRetireExpectation)],
  ['retireVault',   (vaultDB, [scope, expected]) => vaultDB.retireVault(scope as VaultScope, expected as RetireExpectation)],
])

/** What a request posts: its verb and arguments, or nothing when its body is not a JSON object. */
const postedCall = async (request: Request): Promise<{ verb?: unknown, args?: unknown }> => {
  try {
    const posted: unknown = await request.json()
    return typeof posted === 'object' && posted !== null ? posted : {}
  } catch {
    return {}
  }
}

export async function POST(request: Request): Promise<Response> {
  const { verb, args } = await postedCall(request)
  const serve = typeof verb === 'string' ? served.get(verb) : undefined
  if (! serve || ! Array.isArray(args)) {
    return Response.json({ refusal: { kind: 'bad_option', message: 'That is not a vault verb.' } }, { status: 400 })
  }
  // Made per request, for the user your own auth signed in -- never one the request names.
  const vaultDB = postgresVaultDB({ client: pool, userId: await signedInUserId(request) })
  try {
    return Response.json({ result: (await serve(vaultDB, args)) ?? null })
  } catch (err) {
    if (! (err instanceof VaultError)) { throw err }
    // A refusal crosses as its kind and its calm message; never its cause, the driver's own error.
    return Response.json({ refusal: { kind: err.kind, message: err.message } })
  }
}
```

`signedInUserId` is your own: the user id from the request's verified session cookie, or null.
A listing goes through `listBoxRecords`, not `listBoxes`: `listBoxes` hands back summaries, the
shape a vault shows, and a VaultDB in the browser must hand back records as stored.

The client half, a VaultDB over `fetch`, to hand `Vault.make` as its `vaultDB`:

```ts
import { VaultDB, VaultError, VaultErrorKindVals } from 'safebyok'
import type { VaultPropsExpectation, RetireExpectation, Lockbox, LockboxExpectation, LockboxRetireExpectation, VaultProps, VaultDBOpts, VaultErrorKind, VaultScope } from 'safebyok'

const VaultRouteUrl = '/api/safebyok'

export class RouteVaultDB extends VaultDB {
  readonly maxRecordBytes = 1024 * 1024
  readonly maxVaultBytes = Infinity
  readonly maxLockboxes = Infinity // the server's postgresVaultDB maxLockboxes
  readonly maxNameBytes = 640  // the server's postgresVaultDB maxNameBytes

  // Its logger: the host's `logger`, or the default logger when it gives none.
  constructor(opts: VaultDBOpts = {}) { super(opts) }

  protected doReadVaultProps(scope: VaultScope) { return this.call('readVaultProps', scope) }
  protected doFetchOrCreateVaultProps(vaultProps: VaultProps) { return this.call('fetchOrCreateVaultProps', vaultProps) }
  protected async doUpdateVaultProps(vaultProps: VaultProps, expected: VaultPropsExpectation) {
    await this.call('updateVaultProps', vaultProps, expected)
    return true
  }
  protected doReadBox(scope: VaultScope, boxlabel: string) { return this.call('readBox', scope, boxlabel) }
  protected async doListBoxes(scope: VaultScope) {
    const lockboxes = await this.call('listBoxes', scope) as { boxlabel: string }[]
    return lockboxes.map((lockbox) => ({ boxlabel: lockbox.boxlabel, lockbox }))
  }
  protected doUpdateBox(scope: VaultScope, lockbox: Lockbox, expected: LockboxExpectation) { return this.call('updateBox', scope, lockbox, expected) }
  protected doRetireBox(scope: VaultScope, boxlabel: string, expected: LockboxRetireExpectation) { return this.call('retireBox', scope, boxlabel, expected) }
  protected async doRetireVault(scope: VaultScope, expected: RetireExpectation) {
    await this.call('retireVault', scope, expected)
    return true
  }

  // A stale write refuses on the server and crosses as its kind, so a write that answers landed:
  // a lockbox write answers with the lockbox as the server's storage holds it, and a lockbox
  // retirement with what it removed.
  private async call(verb: string, ...args: unknown[]): Promise<unknown> {
    const response = await fetch(VaultRouteUrl, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({ verb, args }),
    })
    const { result, refusal } = await response.json() as { result?: unknown, refusal?: { kind?: unknown, message?: unknown } }
    if (refusal && isKind(refusal.kind) && typeof refusal.message === 'string') {
      throw new VaultError(refusal.kind, refusal.message)
    }
    if (! response.ok) { throw new Error(`The vault route answered ${String(response.status)}`) }
    return result
  }
}

const isKind = (kind: unknown): kind is VaultErrorKind => (VaultErrorKindVals as readonly unknown[]).includes(kind)
```

* **Authenticate by your session**, the cookie `fetch` sends to its own origin, and never by a
  user id in the body. The JSON content type means a cross-site page cannot post to the route
  without a CORS preflight your server would have to allow.
* **No push over a plain route**: the browser's vault refreshes after its own writes, and learns
  of other devices' writes when it next reads. For live updates, carry `subscribe` over a
  socket, server-sent events, or a GraphQL subscription (`safebyok-graphql`), fed by `listen`.
* **A limit of the server's own, if you give one.** Pass `maxLockboxes` and this VaultDB holds
  every vault to that many lockboxes, whatever the browser asks: a new lockbox past it refuses
  with kind `vault_full`, and a lockbox replacing one already there never does. Declare the same
  number as the browser VaultDB's `maxLockboxes`, so that `Vault.make` refuses a larger one up
  front. A limit costs the statement that inserts a new lockbox one count of its vault; with
  none (`Infinity`, the default), nothing is counted, and how large a vault grows is yours to
  bound, by your own quotas. Nothing bounds a vault's bytes beyond that: your framework's request-size limit bounds
  each record. What the limit guarantees is
  [the VaultDB contract's](https://github.com/mrflip/safebyok/blob/main/packages/safebyok/VAULTDB.md) (lines 4.2 to 4.5), and no more:
  * **It is a best effort.** The check is a `count(*)` of the vault's lockboxes in the statement
    that inserts, as of that statement's start. Writes made one after another never take a vault
    past its limit. Writers racing for the last places may each count room and all land: with
    `N` racers one place short of the limit, up to `N - 1` more than it, never an unbounded
    number. That is what the limit is for -- stopping a runaway loop, and keeping a vault inside
    what can be listed and retired -- and not for holding off a determined client, whose quota is
    yours to meter like any other abuse.
  * **A refused write stored nothing.** The refusal is the `WHERE` of one atomic statement.
  * **No lockbox is lost.** Every lockbox that landed reads back by its boxlabel and appears in
    the listing, past the limit as under it; retiring lockboxes brings the vault back under, and a
    new lockbox lands again.
  * **The count a write checks is the vault's, as of the start of its statement.** A write reports
    no count; the vault learns it from the listing it reads after every write.
  * **It costs the host nothing** but the count: no column, trigger, lock or retry, and one
    `count(*)` over the vault's primary-key prefix, at most about `maxLockboxes` index entries,
    since the limit stops growth near it. With no limit, there is no count either.

  **For a hard cap**, which this package does not ship (a trigger is yours to own, and its
  trade-offs depend on your isolation level and your tables), paste this to your coding agent:

  > Read the "A limit of the server's own" bullet of the `safebyok-postgres` README and `VAULTDB.md` (lines
  > 4.2 to 4.5), and the SQL in `vault-tables.sql`. Write me a `BEFORE INSERT` trigger on
  > `safebyok_lockboxes` that refuses a vault's lockbox past a hard limit, and explain its
  > trade-offs: the lock it takes, what my connections' isolation level does to it, and that its
  > refusal surfaces as `storage_unavailable` rather than `vault_full`. Then write the test that
  > proves it against a real Postgres, not PGlite.

## Hearing other writes

Push is opt-in: it needs a trigger in your database and a connection kept open, and a vault
works whole without either.

* **Without them** (the baseline), `subscribe` never calls. The vault refreshes after its own
  writes, and learns of another device's writes the next time it reads.
* **With them**, `subscribe` calls each subscriber after every write to their vault, from any
  server and any device, and once as its listen begins, so a write made while it was starting is
  read too. Run **`VaultNotifySql`** (also shipped as `vault-notify.sql`) once, after
  `VaultTablesSql`, and hand `postgresVaultDB` a `listen`:

```ts
import { VaultNotifySql } from 'safebyok-postgres'

await pool.query(VaultNotifySql)    // once, as a migration: safe to run again
```

Its trigger sends a notification on the channel `VaultChangeChannel` (`safebyok_vault_changes`)
after every write that changes a vault, its payload the vault's scope as JSON: no record, nothing
ciphered. A `listen` without the trigger hears nothing, by design, and says nothing of it; the
trigger without a `listen` costs a notification nobody hears. A `listen` that throws as it is
called refuses `subscribe` as `storage_unavailable`; one that rejects later is warned of through
the `logger`, once, and its subscriber hears nothing more, as without a `listen`.

`listen(channel, onNotify)` calls `onNotify` with each notification's payload and returns the
unlisten (or a promise for it). A PGlite's own `listen` is one, called on its PGlite -- passed
bare, as `listen: pglite.listen`, it loses its `this`, and the VaultDB hears nothing:

```ts
const vaultDB = postgresVaultDB({ client: pglite, userId, listen: (channel, onNotify) => pglite.listen(channel, onNotify) })
```

With `pg`, one long-lived connection LISTENs for the whole server and hands its notifications to
every VaultDB made per request -- not a pooled one, which the pool would hand to someone else:

```ts
import pg from 'pg'
import { VaultChangeChannel } from 'safebyok-postgres'
import type { PostgresListen } from 'safebyok-postgres'

const listener = new pg.Client({ connectionString: process.env.DATABASE_URL })
await listener.connect()
await listener.query(`LISTEN ${VaultChangeChannel}`)

const hearers = new Set<(payload: string) => void>()
listener.on('notification', ({ channel, payload = '' }) => {
  if (channel === VaultChangeChannel) {
    for (const hear of hearers) { hear(payload) }
  }
})

export const listen: PostgresListen = (_channel, onNotify) => {
  hearers.add(onNotify)
  return () => { hearers.delete(onNotify) }
}
```

A notification whose payload is empty (a scope too long for one) or unreadable reaches every
subscriber: at worst, a refresh that finds nothing new.

## What is stored

Two tables, each record **a column to a field**, exactly as safebyok wrote it: text as text, a
time or a count as a `bigint`, and each structured value as one opaque `jsonb` -- an encrypted
value (a cipherIv and its ciphertext, `{ cipher_iv_b64, ciphertext_b64 }`), or the vault props'
`wayins`, their list of wayins. A lockbox's sidecar is `text`, never `jsonb`, which
would rewrite it. Nothing is normalized: a sidecar or a user id reads back byte for byte, as it
must, since every field a record holds is bound into its encryption (all but the vault props'
`unlock_epoch` and which wayins their `wayins` holds).

| Table                | One row per | Primary key                                     | Columns                                                                                                |
| -------------------- | ----------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `safebyok_vaults`    | vault       | `applabel`, `user_id`, `vaultlabel`             | every field of the `VaultProps`                                                                        |
| `safebyok_lockboxes` | lockbox     | `applabel`, `user_id`, `vaultlabel`, `boxlabel` | the vault's scope and `vault_id`, then every field of the `Lockbox`; its sidecar as `text`             |

* **Encrypted**: each whisper (`whisper_ciphered`), each lockbox's lockboxKey
  (`lockbox_key_wrapped`), and the vaultKey, once under each way into the vault (each
  wayin's `vault_key_wayin_wrapped`, inside the vault props' `wayins`).
* **In the open**: the scope, each `boxlabel` and sidecar (`sidecar_json`), each whisper's codec
  and schema version, the `vault_id`, `unlock_epoch`, `revision_tok`s, each wayin's wayinkind, id, label, salt and key deriver's label, when
  each vault and lockbox was first stored and each lockbox last written (`registered_at`,
  `written_at`, epoch milliseconds), and the length of every ciphertext.
* **Never**: a whisper, a passphrase, any key in usable form, or the device-local lease. No history: an update replaces its row (your database's backups and WAL keep what
  they keep).
* **A lockbox stands only beside its vault props**, under the same `vault_id`: the foreign key
  retires a vault's lockboxes with its props, in one statement, and refuses a lockbox written for
  a vault since retired and made anew.
* **Row-level security is on, with no policy**: the tables' owner -- the role your server
  connects as -- reaches them as before, and every other role reaches no row. To serve the
  tables to another role, give it a policy of your own, or connect as their owner.

## On Supabase

Supabase is Postgres, so this package runs there as it stands: put `vault-tables.sql` in a
migration (`supabase/migrations/`), and run `postgresVaultDB` on your server, or in an Edge
Function, connected with your project's database connection string, its `userId` the one
`supabase.auth.getUser()` verified on the server.

* **Keep the tables out of the Data API.** Supabase serves every table in the `public` schema to
  the browser through its Data API, under row-level security. The tables come with it on and no
  policy, so the `anon` and `authenticated` roles reach nothing: leave them so. Your server's
  connection, as the tables' owner, is the only way in, and the only one that checks the user.
* **Listen over a direct or session-mode connection.** LISTEN needs a connection of its own for
  as long as it listens; the transaction-mode pooler (port 6543) cannot give it one.

**Untested on Supabase.** This package has not been run against Supabase. This section is a reading of
Supabase's documentation, not something the package's tests run: try it against a project of your
own before you rely on it.

## Writing an adapter of your own

This package is the example of a SQL backend, as `safebyok-convex` is of a hosted one and the
IndexedDB adapter of a key-value store. To store vaults in another SQL database, or another
shape of table, copy it, and keep to what makes it right:

* **Extend `VaultDB` and write its `do*` methods**, never its public verbs: the base class checks
  labels and scope on the way in, validates every record and answer on the way out, and turns a
  `false` (from a lockbox write or retirement, a `null`) into `stale_write` and anything you
  throw into `storage_unavailable`.
* **One statement per verb**, so each is atomic without a transaction: the expectation goes in
  the `WHERE` (`UPDATE ... WHERE vault_id = $ AND unlock_epoch = $ RETURNING 1`), and a row
  back means it landed. A lockbox write returns the row's columns (`RETURNING format, boxlabel,
  ...`): the lockbox as stored, which the base class reads back as it would a read. A lockbox
  retirement deletes whatever stands within the expected vault and returns its `revision_tok`
  (`DELETE ... RETURNING revision_tok`), so it can say whether it removed the revision the device
  named, another, or none. A create returns the row that stands with `ON CONFLICT ... DO UPDATE`
  (a no-op update), since `DO NOTHING` returns no row when another device got in first.
* **Let the schema hold the vault together.** The lockbox's foreign key names its vault row down
  to the `vault_id`, so a lockbox cannot outlive its vault or land in one made anew, and retiring
  a vault is one `DELETE` of its vault row.
* **Store each record a column to a field**, and compare only the scope, `boxlabel`, `vault_id`,
  `unlock_epoch`, `vault_key_epoch` and `revision_tok`. `src/columns.ts` names each record's columns once, the
  compiler holding the list to the record's fields both ways, and builds every statement from it.
* **Authorize in the adapter**: made per request for one user, it refuses every other user's
  scope with `identity_revoked`.
* **Enforce the lockbox limit in the write itself, as a best effort.** A count read in one
  statement and checked in the next lets writes slip through between them; a `count(*)` inside
  the insert narrows that to writers whose statements overlap, which may each count room and
  all land. The contract allows that (line 4.2), and costs nothing. Have the insert answer, from
  its one snapshot, why it missed -- the vault stood, the boxlabel was already taken, the vault
  was full -- so that no second read is needed to tell a full vault from a stale writer. And
  map a foreign key violation (`23503`) on the insert to `stale_write`: a vault retired after the
  statement's snapshot, before its foreign key check, is only a stale writer.
* **Read the vault row `FOR SHARE` in a lockbox write, and know why.** A lockbox write compares
  the vault props' `vault_key_epoch` (contract line 3.8), a column no foreign key covers, and a
  plain read would take it from the statement's snapshot: an update of the vault props committed
  after the snapshot -- a rotation of the vaultKey -- would go unseen, and a device still holding
  the replaced vaultKey could seal a whisper under it. `FOR SHARE` makes the update wait for the
  write, or the write for the update and then re-read the vault props as they stand. It is a
  shared lock, so lockbox writes never wait for each other on the vault row. A trigger of your own
  that locks the vault row anew -- `FOR UPDATE`, say -- turns two such writers into a deadlock:
  serialize on something else (the hard cap above takes an advisory lock).
* **Prove it with the shared suite**: `describeVaultDB` from `safebyok/testing` runs every verb,
  expectation and refusal against a fresh adapter. Its two users' vaults go through one adapter,
  so a per-request adapter answers it with one VaultDB per user, through `perUser` from
  `safebyok/testing`.

## Developing this package

`pnpm justify` here runs its lint, typecheck, tests and build, with publint and
arethetypeswrong. The tests run against [PGlite](https://pglite.dev), a real Postgres compiled to
WebAssembly and run in-process: no database server, and every statement exactly as Postgres
runs it, row-level security and foreign keys included. They build the core first
(`pnpm build:deps`) and read it through its `dist/`, as a consumer would; the typecheck and lint
read it from source. `tests/route-recipe.test.ts` runs the README's route recipe, and changes
with it.
