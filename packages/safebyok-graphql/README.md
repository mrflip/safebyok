# safebyok-graphql

safebyok's vaultDB over [GraphQL](https://graphql.org), in two halves:

* **On your server**, `safebyok-graphql/server`: **`VaultSchemaSdl`**, the schema as SDL, and
  **`vaultResolvers({ vaultDB, getUserId })`**. Each operation is one of the vaultDB's own verbs,
  called on the vaultDB your server hosts ([`safebyok-postgres`](../safebyok-postgres)'s, or your
  own), and returns that verb's answer, for the signed-in user's bank only.
* **In the browser**, `safebyok-graphql`: **`new GraphQLVaultDB({ client })`**, the vaultDB over
  your app's [urql](https://commerce.nearform.com/open-source/urql/) Client, to hand `Bank.make`.
  It takes the Client alone. Limits such as `maxBoxes` and `maxRecordSizeEst` are set on the vaultDB
  your server hosts and hands to `vaultResolvers`. The browser half sets none.

**Deploy the two halves together.** The browser half sends the documents the server half's schema
serves, and checks each answer against its own copy of safebyok. An answer that fails those checks,
such as one from a server on another version, refuses as `unexpected_error`.

Your server and your database have ciphertext and the few unencrypted fields a row is found by.
Neither ever sees a whisper, a passphrase, or a key that could decipher one.

## Install

```sh
pnpm add safebyok safebyok-graphql safebyok-postgres
pnpm add @urql/core graphql      # if your app has neither already
```

`safebyok`, `@urql/core` and `graphql` are peer dependencies, so your app and this package share
one copy of each. The browser half needs only `@urql/core`, the server half only `graphql`.

**The server half and your GraphQL server must share one copy of `graphql`.** With two, the
scalars `vaultResolvers` makes come from the other copy, and graphql refuses them as from "another
module or realm". `pnpm why graphql` shows how many copies you have.

## The recipe: Yoga on Next.js, Postgres behind

`tests/yoga-recipe.test.ts` runs this recipe, with Yoga's error masking on, through the battery
every vaultDB passes. The workspace's `e2e/tests/graphql/` runs it again over real sockets and a
real Postgres.

The route, `app/api/graphql/route.ts`:

```ts
import { createSchema, createYoga } from 'graphql-yoga'
import { Pool } from 'pg'
import { PostgresVaultDB, pgClientOf } from 'safebyok-postgres'
import { VaultSchemaSdl, vaultResolvers } from 'safebyok-graphql/server'
import { listen } from './listen'                  // safebyok-postgres's README, "Hearing other writes"
import { signedInUserId } from '@/auth'            // your own: the session's user, or null

type VaultContext = { user_id: string | null }

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const vaultDB = new PostgresVaultDB({ client: pgClientOf(pool), listen })

const schema = createSchema<VaultContext>({
  typeDefs:  [VaultSchemaSdl],
  resolvers: [vaultResolvers({ vaultDB, getUserId: ({ user_id }: VaultContext) => user_id })],
})

const { handleRequest } = createYoga<object, VaultContext>({
  schema,
  graphqlEndpoint: '/api/graphql',
  context:         async ({ request }) => ({ user_id: await signedInUserId(request) }),
  maskedErrors:    { isDev: process.env.NODE_ENV === 'development' },
})

export { handleRequest as GET, handleRequest as POST }
```

The browser:

```ts
import { Client, fetchExchange } from '@urql/core'
import { Bank } from 'safebyok'
import { GraphQLVaultDB } from 'safebyok-graphql'

const client = new Client({ url: '/api/graphql', exchanges: [fetchExchange], fetchSubscriptions: true })
const bank = Bank.make({ applabel: 'acme', user_id: session.user_id, vaultDB: new GraphQLVaultDB({ client }), ... })
```

Your app's own Client works: `GraphQLVaultDB` sends every query `network-only`, so a document
cache in front of it changes nothing. `fetchSubscriptions: true` carries `watch` over server-sent
events, and a Client with a WebSocket exchange for subscriptions works as well. When a watch's
stream ends, by a closing result, an error or a refusal, the bank's `onBadNews` is called once:
with `storage_unavailable`, with `unexpected_error` for a GraphQL error, or with the refusal itself.
The watch does not subscribe again. Whether to start over is up to you, and a watch that has ended
starts again on `goodbye()` then `hello()`. A stream that ends with an `identity_revoked` refusal
reports nothing. Over a WebSocket exchange (urql's `subscriptionExchange` with graphql-ws), a stream
that ends before its first result, or on a graphql-ws error, sends no closing result, so its end
goes unreported.

## Who reaches which bank

One vaultDB serves every request. **`getUserId(context)`** returns the user your own auth signed
in for this request, or null. Each operation names the bank it reaches (its `user_id`, its ask's,
or a gate verb's record's), and the resolvers serve it only when that is the signed-in user's bank.
Any other request gets an answer refused as `identity_revoked`, and the vaultDB is not called. A
put's or del's record must be at its ask's address, and the vaultDB's own check of the ask enforces
that before anything is read.
A `watch` subscription calls `getUserId` again at each change it would send. Once it returns anyone
other than the user it subscribed as, its last notice is the `identity_revoked` refusal, the stream
ends, and the browser does not subscribe again. A `getUserId` that looks the session up live,
rather than reading what the request carried, is what lets a revoked session's stream end. An
idle stream stays open until its next change.

**When the signed-in user changes, vacate the bank and make another.** A bank, its vaults and its
boxes keep the `user_id` they were made with for life, and nothing in safebyok moves them to a new
one. On sign-out, or a sign-in as someone else, call `bank.vacate()` and make a new bank with
`Bank.make` for the new user. The resolvers refuse the old bank's calls as `identity_revoked`, and
that is all they do about it.

`tidyGone`, which removes the box rows of deleted vaults and counts those left, is an operation like
the rest, behind the same sign-in check: a host calls `tidyGone({ applabel, user_id })` on its
`GraphQLVaultDB`, and the vaultDB behind your resolvers tidies the signed-in user's bank.

The vaultDB the resolvers call checks what it is sent, as the browser's vaultDB checks it before
sending, so a caller that skips those checks, or is not a browser at all, is refused the same.
A get, put or del hands the vaultDB's verb the ask as it came, and that verb's own check of the ask
runs before anything is read.

## What crosses the wire

Every operation returns a typed object with the same fields as its verb's `try*` answer: `ok`, `act`,
`val`, `world`, `dbhas`, `ask` and `err`. `ask` carries the call's address, policies and row
revisions, never a record's payload. Rows are typed: a live row and a tombstone are each a
member of a union. A box's sidecar, a damaged row and a refusal's meta are `SafebyokJson`, carried
whole. Times are `SafebyokEpochMillis`, integer UTC epoch milliseconds beyond the range of GraphQL's
32-bit `Int`. A get, put or del takes one argument, `ask`: an input whose fields are those of the core's
ask (`op`, the address, `ifAbsent` and `ifPresent`, the row it `expected`, read as that row's
revision, `am` and tokens, the `record` to store, and a vault put's `gateVerb`). A listing takes
its scope as typed arguments, and a gate verb its `record` and `opts`. So your logs and allowlists
see whose bank each operation reaches. Every name the schema adds begins `safebyok` or `Safebyok`, to sit beside your own.
`VaultOperations` has the documents `GraphQLVaultDB` sends, for a server that allows only the
operations it knows.

**A refusal is the answer's `err` field, never a GraphQL error.** It carries its `refusalkind`, its
message, and in `meta` the `capacity` of a `vault_full`, the `fieldnames` it names and the `call` it
refused. The browser rethrows it as a VaultError of that kind. The box cap is the `maxBoxes` of the
vaultDB behind your resolvers, a best-effort limit: exact at moderate write rates, never a strict
one. **Nothing else of a refusal is sent**, not even its cause, so a driver's message stays on your server.

In the browser, a failed fetch is `storage_unavailable`, its cause naming only the error, the HTTP
status and a code such as `ECONNREFUSED`, never a message or a response's body. A GraphQL error, or an answer the core's
checks refuse, is `unexpected_error`: a server out of step with this copy of safebyok.

## Developing this package

`pnpm justify` here runs its lint, typecheck, tests and build, with publint and arethetypeswrong.
The tests run in-process, with no database or GraphQL server to stand up. The battery runs over a
`GraphQLVaultDB` whose urql Client executes against the resolvers, over a `PostgresVaultDB` on
[PGlite](https://pglite.dev), with a second Client as another device. It runs again through Yoga
over fetch, as in the recipe. A drift test checks every type the schema sends or takes against the core check
that reads it. Before running `vitest` by hand, run `pnpm build:deps`: the tests read
the core and `safebyok-postgres` from their `dist/`.
