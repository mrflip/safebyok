# safebyok-graphql

safebyok's vaultDB over [GraphQL](https://graphql.org), in two halves:

* **On your server**, `safebyok-graphql/server`: **`VaultSchemaSdl`**, the schema as SDL, and
  **`vaultResolvers({ vaultDB, userIdOf })`**, which carry each generic call of a server-side
  vaultDB ([`safebyok-postgres`](../safebyok-postgres)'s, or your own) to the browser, refusing a
  request that reaches a bank other than its signed-in user's.
* **In the browser**, `safebyok-graphql`: **`new GraphQLVaultDB({ client })`**, the vaultDB over
  your app's [urql](https://commerce.nearform.com/open-source/urql/) Client, to hand `Bank.make`.

Your server and your database hold ciphertext and the few plain fields a row is found by; neither
ever sees a whisper, a passphrase, or a key that opens one.

## Install

```sh
pnpm add safebyok safebyok-graphql safebyok-postgres
pnpm add @urql/core graphql      # if your app has neither already
```

`safebyok`, `@urql/core` and `graphql` are peer dependencies, so your app and this package share
one copy of each. The browser half needs only `@urql/core`, the server half only `graphql`.

**The server half and your GraphQL server must share one copy of `graphql`.** With two, a
refusal is a GraphQLError your server does not recognize: Yoga masks it as "Unexpected error",
and the browser hears `storage_unavailable` for every refusal. `pnpm why graphql` shows how many
copies you have.

## The recipe: Yoga on Next.js, Postgres behind

`tests/yoga-recipe.test.ts` runs this recipe, with Yoga's error masking on, through the battery
every vaultDB passes.

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
  resolvers: [vaultResolvers({ vaultDB, userIdOf: ({ user_id }: VaultContext) => user_id })],
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

Your app's own Client serves: `GraphQLVaultDB` asks every query `network-only`, so a document
cache in front of it changes nothing. `fetchSubscriptions: true` carries `watch` over server-sent
events; a Client with a WebSocket exchange for subscriptions serves as well.

## Who reaches which bank

One vaultDB serves every request. **`userIdOf(context)`** answers the user your own auth signed
in for this request, or null. Each operation names the bank it reaches (its `user_id`, or its
record's or tombstone's), and the resolvers serve it only when that is the signed-in user's;
anything else refuses as `identity_revoked`, before the vaultDB is called.

The resolvers check what they are sent as the browser's vaultDB checks it before sending, so a
caller that skips those checks, or is not a browser at all, is refused the same.

## What crosses the wire

Rows, records and options cross as one JSON scalar, `SafebyokJson`, checked by the vaultDB at each
end; scopes are typed arguments, so your logs and allowlists see whose bank each operation reaches.
Every name the schema adds begins `safebyok` or `Safebyok`, to sit beside your own.
`VaultOperations` holds the documents `GraphQLVaultDB` sends, for a server that allows only the
operations it knows.

A refusal crosses as a GraphQLError with its message and `extensions: { kind }`, with `capacity`
for `vault_full` and `fieldnames` where it names fields, and the browser throws it again as that
VaultError. **Nothing else of an error crosses.** A driver's message, or anything your `userIdOf`
throws, stays on the server as the GraphQLError's `cause`, for your logs; the browser hears
`storage_unavailable` or `unexpected_error`. A network failure, or an error the resolvers did not
send, is `storage_unavailable` in the browser.

## Developing this package

`pnpm justify` here runs its lint, typecheck, tests and build, with publint and arethetypeswrong.
The tests run in-process, with no database or GraphQL server to stand up: the battery runs over a
`GraphQLVaultDB` whose urql Client executes against the resolvers, over a `PostgresVaultDB` on
[PGlite](https://pglite.dev), with a second Client as another device; and again through Yoga over
fetch, as in the recipe. Before running `vitest` by hand, run `pnpm build:deps`: the tests read
the core and `safebyok-postgres` from their `dist/`.
