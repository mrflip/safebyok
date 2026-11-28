# safebyok-graphql

A `VaultDB` for safebyok over [GraphQL](https://graphql.org), in two halves:

* **On your server**, `safebyok-graphql/server`: **`VaultSchemaSdl`**, the schema as SDL, and
  **`vaultResolvers({ vaultDB, getUserId })`**. Each operation calls one of the vaultDB's own verbs
  on the vaultDB your server hosts ([`safebyok-postgres`](../safebyok-postgres)'s, or any other), and
  returns that verb's answer, for the signed-in user's bank only.
* **In the browser**, `safebyok-graphql`: **`new GraphQLVaultDB({ client })`**, the vaultDB over your
  app's [urql](https://commerce.nearform.com/open-source/urql/) Client.

**Deploy the two halves together.** The browser half sends the documents the server half's schema
serves, and checks each answer's form against its own copy of safebyok. An answer that fails those
checks, such as one from a server on another version, is refused as `storage_issue`.

Your server and your database have ciphertext and the few unencrypted fields a Thing is found by.
Neither ever sees a whisper, a passphrase, or a key that could decipher one.

It replaces the GraphQL adapter built on safebyok-big, now the private `safebyok-graphql-big`. Its
schema is another, so a server must serve this package's resolvers to a browser running this package.

## Install

```sh
pnpm add safebyok safebyok-graphql
pnpm add @urql/core graphql      # if your app has neither already
```

`safebyok`, `@urql/core` and `graphql` are peer dependencies, so your app and this package share one
copy of each. The browser half needs only `@urql/core`, the server half only `graphql`.

**The server half and your GraphQL server must share one copy of `graphql`.** With two, the scalar
`vaultResolvers` makes comes from the other copy, and graphql refuses it as from "another module or
realm". `pnpm why graphql` shows how many copies you have.

## Use

On your server, with any GraphQL server that takes SDL and resolvers:

```ts
import { createSchema } from 'graphql-yoga'
import { VaultSchemaSdl, vaultResolvers } from 'safebyok-graphql/server'

type VaultContext = { userid: string | null }      // your own: the session's user, or null

const schema = createSchema<VaultContext>({
  typeDefs:  [VaultSchemaSdl],
  resolvers: [vaultResolvers({ vaultDB, getUserId: ({ userid }: VaultContext) => userid })],
})
```

In the browser:

```ts
import { Client, fetchExchange } from '@urql/core'
import { GraphQLVaultDB } from 'safebyok-graphql'

const client = new Client({ url: '/api/graphql', exchanges: [fetchExchange], fetchSubscriptions: true })
const vaultDB = new GraphQLVaultDB({ client })
```

Hand it to the core wherever a `VaultDB` is asked for.

* **Your app's own Client works.** `GraphQLVaultDB` sends every query `network-only`, so a document
  cache in front of it changes nothing. `fetchSubscriptions: true` carries `watch` over server-sent
  events; a Client with a WebSocket exchange for subscriptions works as well.
* **Limits are set on the server.** The browser half is given the Client alone.
* An option either half cannot use is refused with `bad_record`.

## Who reaches which bank

One vaultDB serves every request. **`getUserId(context)`** returns the user your own auth signed in
for this request, or null. Each operation names the bank it reaches, by its ask's `userid`, and the
resolvers serve it only when that is the signed-in user's bank. Any other request is answered
`identity_revoked`, and the vaultDB is not called. Where `getUserId` throws, the operation fails
with a GraphQL error carrying the refusal for it (see *What crosses the wire*): `unexpected_error`,
with none of the error's text, or the VaultError it threw.

A watch calls `getUserId` again at each change it would send. Once that returns anyone other than
the user it subscribed as, its last notice is the `identity_revoked` refusal and the stream ends. A
`getUserId` that looks the session up live, rather than reading what the request carried, is what
lets a revoked session's stream end. An idle stream stays open until its next change.

**When the signed-in user changes, make another device.** A device keeps the user it was made with
for life. The resolvers refuse the old bank's calls as `identity_revoked`, and that is all they do
about it.

The vaultDB the resolvers call checks each ask as it came, as the browser's vaultDB checks it before
sending, so a caller that skips those checks, or is not a browser at all, is refused the same.

## What crosses the wire

Each verb is one operation: `safebyokGetThing`, `safebyokListThings`, `safebyokGetBank` and
`safebyokStats` are queries, `safebyokWriteThing` (every write, whatever its flags) and
`safebyokBirthBank` are mutations, and `safebyokWatchThings` is a subscription. Every name the schema
adds begins `safebyok` or `Safebyok`, to sit beside your own. `VaultOperations` has the documents
`GraphQLVaultDB` sends, for a server that allows only the operations it knows.

Each operation takes the verb's ask, typed, and returns an object with the fields of the verb's
`try*` answer, less its ask. A Thing, a `tracked` and a track cross as `SafebyokJson`, carried whole;
everything else is typed. The browser half answers what the server's vaultDB answered, once it has
checked the answer's form and that each Thing it carries sits where the ask reaches: at the ask's
scope, one label under a listing's parent in the ask's table, or at a root's scope, always in the
ask's bank and of the kind it is checked against. It leaves the act, and the body of each Thing, to
the server's vaultDB, which made them.

**A refusal of the vaultDB's is the answer's `err` field, never a GraphQL error.** It carries its `refusalkind`, its
message, and in `meta` the `oplabel` it refused, its `act`, the `capacity` of a `vault_full`, and the
`fieldnames` and `labelpaths` it names. The browser answers it as the server's vaultDB did. **Nothing else of a refusal is sent**, not its cause, its ask or the
rows it names, so a driver's message stays on your server.

A request the resolvers cannot serve, where `getUserId` throws, or one that breaks the package's
rules, as a watch scope that fails its check (which only another client sends, and which is refused
`bad_record`), fails with a GraphQL error instead. Its `extensions.safebyokErr` is the refusal, in
the same form as `err`.

In the browser:

* a failed fetch is `storage_unavailable`, its cause naming only the error, the HTTP status and a
  code such as `ECONNREFUSED`, never a message or a response's body;
* a GraphQL error carrying a refusal under `extensions.safebyokErr` is that refusal;
* any other GraphQL error, or a result that lacks the operation's field, is `unexpected_error`, with no cause;
* an answer of another form, or carrying a Thing where its ask reaches none, is `storage_issue`.

### A watch

Each change to the bank's Things arrives as a notice. Bad news the server's watch meets arrives as a
notice too, and the watch goes on. When the watch ends, by a notice the server marks as its last, by
the stream closing, or by an error, the core's `onEnded` is called, then `onBadNews` once with why:
the refusal the server sent, `storage_unavailable` for a closed stream or a failed fetch, or
for a GraphQL error the refusal it carries, else `unexpected_error`. The watch does not subscribe again. Over a WebSocket exchange
(urql's `subscriptionExchange` with graphql-ws), a stream that ends before its first result, or on a
graphql-ws error, sends no closing result, so its end goes unreported.

## Developing this package

```sh
pnpm --filter safebyok-graphql test
```

The tests run in-process, with no database or GraphQL server to stand up. The battery every vaultDB
passes runs over a `GraphQLVaultDB` whose urql Client executes against the resolvers, over a
`MemoryVaultDB` and over a `PostgresVaultDB` on [PGlite](https://pglite.dev). A drift test checks
every typed input and answer of the schema against the core check that reads it.
