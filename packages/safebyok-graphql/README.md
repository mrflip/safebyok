# safebyok-graphql

safebyok's storage over [GraphQL](https://graphql.org), in two halves:

* **On your server**, `safebyok-graphql/server`: **`VaultSchemaSdl`**, the schema as SDL, and
  **`vaultResolvers`**, its resolvers, each root field one verb of a VaultDB made per request for
  the signed-in user -- [`safebyok-postgres`](../safebyok-postgres)'s, or one of your own. They
  drop into any GraphQL server beside your own schema.
* **In the browser**, `safebyok-graphql`: **`graphqlVaultDB({ client })`**, the VaultDB over your
  app's [urql](https://commerce.nearform.com/open-source/urql/) Client, to hand `Bank.make`.

Your server and your database hold ciphertext and a few unencrypted fields; neither ever sees a
whisper, a passphrase, or any key that opens one.

## Install

```sh
pnpm add safebyok safebyok-graphql safebyok-postgres
pnpm add @urql/core graphql      # if your app has neither already
```

`safebyok`, `@urql/core` and `graphql` are peer dependencies: your app installs them, so the
adapter and your app share one copy of each. The browser's half needs `@urql/core` (for its types;
it calls only your Client), and the server's half needs `graphql` -- your GraphQL server has it
already -- so that its refusals are the GraphQLErrors your server knows. Neither half needs the
other's.

**The server half and your GraphQL server must share one copy of `graphql`.** With two (a
second version installed beside your server's), every refusal is a GraphQLError your server does
not recognize: Yoga masks it as "Unexpected error", and its kind is lost. `pnpm why graphql`
shows how many you have.

Platform: Node 22 and up on the server, evergreen browsers on the client; the floor is stated in the
core's *Where it runs*.

## The recipe: Yoga on Next.js, Postgres behind

The package's tests run this recipe whole (`tests/yoga-recipe.test.ts`), against the same suite
every VaultDB passes, with Yoga's error masking on.

The server half, `app/api/graphql/route.ts`:

```ts
import { Pool } from 'pg'
import { createSchema, createYoga } from 'graphql-yoga'
import { postgresVaultDB } from 'safebyok-postgres'
import { VaultSchemaSdl, vaultResolvers } from 'safebyok-graphql/server'
import { listen } from './listen'   // safebyok-postgres's README: one pg connection LISTENing for the server

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

/** What each request's resolvers know of it: the user your own auth signed in, or null. */
type VaultContext = { user_id: string | null }

const schema = createSchema<VaultContext>({
  typeDefs:  [appTypeDefs, VaultSchemaSdl],
  resolvers: [appResolvers, vaultResolvers({ vaultDBFor: ({ user_id }: VaultContext) => postgresVaultDB({ client: pool, user_id, listen }) })],
})

const { handleRequest } = createYoga<object, VaultContext>({
  schema,
  graphqlEndpoint: '/api/graphql',
  // Made per request, for the user your own auth signed in -- never one the request names.
  context:         async ({ request }) => ({ user_id: await signedInUserId(request) }),
  fetchAPI:        { Response },
})

export { handleRequest as GET, handleRequest as POST }
```

`signedInUserId` is your own: the user id from the request's verified session cookie, or null.

The browser half, handed to `Bank.make` as its `vaultDB`:

```ts
import { Client, fetchExchange } from '@urql/core'
import { graphqlVaultDB } from 'safebyok-graphql'

const client = new Client({ url: '/api/graphql', exchanges: [fetchExchange], fetchSubscriptions: true })
const bank = Bank.make({ ...browserOpts(), applabel: 'acme', user_id: session.user_id, vaultDB: graphqlVaultDB({ client }) })
const vault = await bank.ensureVault({ vaultlabel: 'main' })
```

Your app's own Client serves, cache exchange and all: every query the vault sends is
`network-only`, so the cache never answers for a vault.

* **Authenticate by your session**, the cookie `fetch` sends to its own origin, and never by a
  user id in the operation. The scope a browser names is checked against that user by the VaultDB
  (`identity_revoked` for anyone else's, or while signed out, on which the browser's vault locks
  itself).
* **`fetchSubscriptions: true`** sends the vault's subscription over the same route, as
  server-sent events, which Yoga serves as it stands. Without it, or another way to send
  subscriptions, nothing is pushed: the vault refreshes after its own writes, and learns of other
  devices' when it next reads.

## The server half

```ts
vaultResolvers({ vaultDBFor: (context) => postgresVaultDB({ client: pool, user_id: context.user_id, listen }) })
```

* **`vaultDBFor(context)`** makes the VaultDB for one request, from your server's context for it.
  It is called for every vault field resolved, so keep it cheap: `postgresVaultDB` connects to
  nothing. Over a websocket, the context is the connection's, so its user is the one signed in
  when it opened. To refuse a signed-in user by a rule of your own, throw
  `Refusals.notPermitted('...')` (from `safebyok`) here: it crosses as it is, kind and message,
  and locks nothing; a `VaultError` of kind `identity_revoked` crosses likewise, and locks the
  vault, so throw it only for a user your app knows is gone. Anything else it throws is your
  server's setup gone wrong, and crosses as `bad_option` saying only that: its own message stays
  on your server, as the cause. Let the VaultDB, not `vaultDBFor`, refuse a request signed out.
* **Who may reach a vault** is the VaultDB's to say. `postgresVaultDB`, made for the signed-in
  user, refuses every other user's vault, and any while signed out, before asking the database
  anything.
* **A refusal crosses as a GraphQL error**: its message the VaultError's calm one, its
  `extensions.kind` its kind, and nothing else -- never a record, and never the VaultError's
  `cause`, your driver's own error, which may name your database or quote a row. That stays on
  your server, as the GraphQL error's `cause`, for your own logs. Anything else a VaultDB throws
  crosses as `storage_unavailable`.
* **What a refusal learned crosses in the mutation's body, not in the error.** GraphQL servers,
  gateways and APM tools commonly log an error's `extensions`, and a stale write learns the
  winning vault record (both ways in, its salts and wrapped vaultKeys) or a winning box. So
  `safebyokPutVaultRecord` and `safebyokPutBox` answer `landed: true`, or, for a `stale_write` (and
  for a `vault_full` box write), `landed: false` with the `refusalkind`, the `message`, and
  `vault_stored`, `box_stored` or `capacity`. The browser's `graphqlVaultDB` throws the same
  VaultError from it. Those fields are in the response's `data`: take care that your server's
  logging of responses, where it has any, does not write them down. Upgrade the client and the
  server together; a client and a server of different versions refuse each other's operations
  as `bad_option`.
* **`safebyokVaultChanged`** sends the vault's scope after every write to it, as the VaultDB's
  `subscribe` hears them -- for `postgresVaultDB`, through its `listen` and the optional `VaultNotifySql` trigger, one
  `listen` serving every VaultDB your server makes -- and stops listening when the subscriber goes. Changes that come
  while a subscriber is still busy with the last one go as one. It sends one as it starts, too, when the VaultDB calls
  as its watch begins, as `postgresVaultDB` does: a write made while the browser was subscribing is read then.

### In another GraphQL server

`vaultResolvers` returns a plain resolver map -- `Query`, `Mutation`, and `Subscription` with
`subscribe` and `resolve` -- the shape Yoga, Apollo Server, Mercurius and graphql-tools'
`makeExecutableSchema` take. `VaultSchemaSdl` defines `type Query`, `type Mutation` and `type
Subscription` of its own; hand it in a list beside your own type definitions, and the server
merges them. The tests run it in Yoga and in `makeExecutableSchema` (which Apollo Server is built
on); Apollo and Mercurius themselves are untested.

Everything the schema adds is named `safebyok...` (a root field) or `Safebyok...` (a type), so
it meets nothing of yours.

### Serving a VaultDB of your own

The resolvers need a **`ServedVaultDB`**: the VaultDB verbs a browser's vault calls, and
`getVaultRecords(scope)` and `ensureVaultRecords(draft)`, which hand on a vault checked and split:
its record, its sound boxes without their two ciphered fields, and its damaged boxes apart. The
resolvers carry it as `SafebyokVault`, `{ vault, boxes, damagedBoxes }`, the shape a VaultDB's half
answers, so the browser's VaultDB passes it through (rebuilding each record from its own fields,
which leaves GraphQL's `__typename` behind), and its base class checks each sound box again and
parses the server's word on each damaged one. A vault read is one query, its record and its boxes
from one step of the server's VaultDB.
`safebyok-postgres`'s VaultDB is a ServedVaultDB as it stands; nothing here is tied to Postgres.

Every stored field is non-null in the schema but the vault record's `gate`, null while a vault
has none, and its `passkey`, null when the vault has none. A listing of yours that hands back a record missing
one fails in GraphQL itself, before any VaultError is made, and reaches the browser as
`storage_unavailable`, not as a box listed damaged: Postgres's `NOT NULL` columns rule it out, and a
store of your own keeps every field it was handed.

The resolvers decide nothing: every expectation crosses whole, and the VaultDB you serve keeps
[the VaultDB contract](https://github.com/mrflip/safebyok/blob/main/packages/safebyok/VAULTDB.md)
for the browser. Its line 3.3 in particular: a box write's expectation names the `vault_tok` the
box was sealed for and the revision it read, and your VaultDB lands it only while both stand,
compared in the same atomic step as the write. `tests/yoga-recipe.test.ts` runs the shared suite
through the recipe, that line included.

## The browser half

`graphqlVaultDB({ client })` is a VaultDB, each verb one operation through `client`.

* **A refusal crosses**: the server's VaultError comes back as the same VaultError, kind and
  message, the GraphQL error it crossed as for its `cause`. A GraphQL error your server's own auth
  raises with `extensions.code` `FORBIDDEN` (Apollo's convention) refuses with kind
  `not_permitted`, which locks nothing, its error the `cause`; one with `UNAUTHENTICATED` refuses
  with kind `storage_unavailable`, since a token expired mid-refresh is not a user gone, and
  `identity_revoked` would lock the vault. A record or expectation at fault is `bad_record`, refused before it is sent (an epoch
  past GraphQL's 32-bit `Int` included), or by the server's VaultDB, crossing by its kind. So a server that refuses the operation's shape or
  variables (`extensions.code` `BAD_USER_INPUT` or `GRAPHQL_VALIDATION_FAILED`) is serving a
  schema of another version, and refuses with kind `bad_option`, quoting nothing of it, since such
  an error may quote the variables. Anything else
  -- the network down, a server not serving this schema -- refuses with kind
  `storage_unavailable`, urql's own error as its `cause`.
* **It holds a record to 1 MiB**, as the Postgres VaultDB behind it does, and a vault to no size
  of its own. Its names are labels and user_ids, checked by the package (`VAULTDB.md`, *Names*).
* **The server checks** who may reach which vault, that each write is atomic, and that each
  record has its shape and each name passes its check and fits its storage's limits (the
  VaultDB verbs' own checks, `VAULTDB.md`, *Names*); never what a box's sidecar holds.
* **It declares the box limit your server holds a vault to**: none (`Infinity`), as the
  Postgres VaultDB sets none unless told, or the `maxBoxes` you pass
  (`graphqlVaultDB({ client, maxBoxes: 250 })`). Pass the number your server's
  VaultDB enforces, so `Bank.make` refuses a vault asking for more up front; the server refuses a
  new box past its own with kind `vault_full` either way, and the refusal crosses, with how full
  the vault is. `getCapacity` asks the server's VaultDB the same, through `safebyokGetCapacity`.
* **A subscription that fails** (the server refusing it, the socket dropping) is not retried. It
  is warned of through the `logger`, once, and calls the vault's listener, so the vault reads
  again and meets the trouble itself: a server's `identity_revoked` locks it. After that, the
  vault goes on refreshing after its own writes.
* **`logger`**, when given, hears what the VaultDB has to say (`graphqlVaultDB({ client, logger
  })`); left out, it is the one `Bank.make` is given, else the console.
* **Client and server move in step.** The browser half and `safebyok-graphql/server` are one
  version of one package: a client of one version against a server of another can fail every
  call on a field one of them does not know, and the user sees `storage_unavailable`, which
  reads like a passing outage. Deploy them together, and do not retry your way past it.
* **For a server that accepts only persisted operations**, `VaultOperations` holds every
  document the client sends, by the root field it asks for, to register in your allowlist
  (`import { VaultOperations } from 'safebyok-graphql'`). They change only as the SDL does.

## What crosses the wire

Every record crosses **field by field**, each its own GraphQL field under the name it is stored
by, exactly as safebyok wrote it:

| Type                     | Carries                                                           |
| ------------------------ | ----------------------------------------------------------------- |
| `SafebyokVaultRecord`    | every field of the `VaultRecord`; its `gate` a `SafebyokGate`, null while the vault is novel |
| `SafebyokGate`           | the vault's ways in: its `passphrase` and its `passkey` or null   |
| `SafebyokBox`            | every field of the `BoxRecord`; its sidecar a `SafebyokSidecar`        |
| `SafebyokVaultTombstone` | what a deleted vault leaves: its scope, `format` and `vault_epoch`, which a deletion answers |
| `SafebyokBoxSparse`  | a sound box as a listing has it: every field but the two encrypted ones |
| `SafebyokBoxDamaged` | a box whose record does not read back, as a listing has it: its boxlabel, revision and `damage` |
| `SafebyokCiphered`   | an encrypted value: its `cipher_iv_b64` and its `ciphertext_b64`  |
| `SafebyokVaultScope` | which vault: `applabel`, `user_id`, `vaultlabel`, as a subscription sends it |

Each record has an input type twin (`SafebyokVaultRecordInput`, `SafebyokGateInput`, and so on), and each expectation
one of its own. A vault's scope is no input type: a root field aimed at a vault takes its
`applabel`, `user_id` and `vaultlabel` as three `String!` arguments of its own, beside the rest.

* **Text is a `String`**, a count (`gate_epoch`, `vault_epoch`) an `Int`, and a time a `Float` -- epoch
  milliseconds, a whole number past what GraphQL's 32-bit `Int` holds.
* **A count is held to GraphQL's 32-bit `Int`**: `gate_epoch`, which goes up by one on each
  change to a vault's ways in, and `vault_epoch`, which goes up with it and with a deletion. Past 2,147,483,647 the field fails on the
  wire and the browser sees `storage_unavailable`. That is accepted: two billion changes to
  the ways in is not a vault anyone keeps.
* **The gate's two ways in**, `passphrase` (always there) and `passkey` (null when the
  vault has none), are each a `SafebyokWayin`, one opaque JSON, its `wayinkind` saying its shape:
  the adapter carries a way in as it is, never looking inside, as the Postgres table stores each
  as one `jsonb`. A change inside a way in reaches the browser with no change here. That is by
  choice, not for want of a typed union: GraphQL has no input unions before graphql 17's
  `@oneOf`, and the adapter is a shelf. They replace the `wayins` list of the vault format before
  (`safebyok-vault-v4`): deploy client and server together, and every vault stored before reads
  as damaged, to be made anew (with `safebyok-postgres` behind your server, drop and recreate its
  tables).
* **A box's sidecar is a `SafebyokSidecar!`**, the app's own JSON object, `{}` for none, carried
  as it is, never null: your server's storage may keep it as a JSON column and
  query it, reordering its keys as it likes, since the box binds its sidecar with keys sorted.
  It replaces `sidecar_json`, the text the box format before (`safebyok-box-v7`) held: deploy
  client and server together, and every vault stored before reads as damaged, to be made anew.
* **Encrypted**: each whisper (`whisper_ciphered`), each boxKey (`box_key_wrapped`), and
  the vaultKey under each way in (inside `passphrase` and `passkey`). **In the open**: everything else, as
  [`safebyok-postgres`](../safebyok-postgres#what-is-stored) lists it.

## Developing this package

`pnpm justify` here runs its lint, typecheck, tests and build, with publint and
arethetypeswrong. The tests run the whole round trip in-process: an urql Client running each
operation against the schema (urql's execute exchange, and in the Yoga recipe Yoga itself over
fetch), the resolvers, and `safebyok-postgres`'s VaultDB over [PGlite](https://pglite.dev), a
real Postgres compiled to WebAssembly. No database or GraphQL server is needed. They build the
core and `safebyok-postgres` first (`pnpm build:deps`) and read them through their `dist/`;
the typecheck and lint read them from source. `tests/yoga-recipe.test.ts` runs this README's
recipe, and changes with it.
