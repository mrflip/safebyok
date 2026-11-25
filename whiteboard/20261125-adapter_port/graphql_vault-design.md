# A new-core vaultDB over GraphQL (design, 2026-11-25)

Thread C of sprint adapter_port. Design only: thread D builds from it once the Coach approves it. Read
*Open questions* first. Each one is a one-way door on the wire, and each comes with a recommendation.

> Would you rename the adapters that still hit -big to -big (safebyok-convex-big, etc) including the idb one, then
> port them to the new code? […]

The names assume thread A has landed. `safebyok-graphql` is now `safebyok-graphql-big`, which runs on
`safebyok-postgres-big`. `safebyok-postgres` keeps the vault side and exports `PostgresVaultDB`. The new
`safebyok-graphql` takes the published name and version back, as the sprint plan's ground rules say.

The design also needs #905 (`stats`: `tryStats` and `doStats`) and #911 (`pg_read_tc`: `Received.read_tc`, and
`PostgresVaultDB` dating each answer and notice with Postgres's `uuidv7()`). Neither is on #912's line yet, so D
waits for the lease_shelf line to become one.

## 1. The shape in one paragraph

The browser's `GraphqlVaultDB` extends `AdapterVaultDB`, as `PostgresVaultDB` and the IndexedDB vaultDB do. The
base class checks each ask, builds the loggable ask and makes the answer. Each `do*` sends the checked ask as one
GraphQL operation. It reads back the server's answer, and runs every record that crossed through the classifier
check that a concrete adapter's report goes through. Then it hands the base class the Actual.

On the server, `vaultResolvers({ vaultDB, getUserId })` wraps any new-core `VaultDB`, a `PostgresVaultDB` in the
recipe. Each resolver checks that the ask's `userid` is the signed-in user. It then calls the verb with the ask as
it came, and sends back the verb's answer, less its `ask`, with its refusal reduced to what may cross. The watch
is a subscription whose notices carry `{ record, banktok, read_tc }`. That is exactly what `doWatch` hands
`receive`, so the device's notices carry the server's `read_tc` (#911).

To the client, the server is its storage. Its answers are checked as any datastore's rows are: storage is in the
threat model, and the host is not.

## 2. Operations

There is one operation per vaultDB verb. Every name begins `safebyok` or `Safebyok`, as in big, so it can sit
beside a host's own schema.

| Verb | Operation | Kind | Argument | Returns |
|---|---|---|---|---|
| `tryGetThing` | `safebyokGetThing` | query | `ask` | `SafebyokAnswer!` |
| `tryListThings` | `safebyokListThings` | query | `ask` | `SafebyokListAnswer!` |
| `tryGetWorld` | `safebyokGetWorld` | query | `ask` | `SafebyokAnswer!` |
| `tryStats` | `safebyokStats` | query | `ask` | `SafebyokAnswer!` |
| `tryWriteThing` | `safebyokWriteThing` | mutation | `ask` (its `op` is `put` or `del`) | `SafebyokAnswer!` |
| `tryBirthBank` | `safebyokBirthBank` | mutation | `ask` | `SafebyokAnswer!` |
| `watch` | `safebyokWatchThings` | subscription | `scope` | `SafebyokNotice!` |

The plan's gloss lists put and del apart. They are one verb, `tryWriteThing`, so they are one operation (Q4).
`VaultOperations` exports the seven documents `GraphqlVaultDB` sends, for a server that allows only operations it
knows, as `BankOperations` does in big.

### SDL sketch (recommended form, Q1–Q3)

```graphql
"Any JSON value, carried whole. The core's checks read it at each end."
scalar SafebyokJson

"A refusal as it crosses: its kind, its message, and the meta a server lets cross. Never its cause."
type SafebyokErr {
  refusalkind: String!
  message:     String!
  meta:        SafebyokErrMeta!
}
type SafebyokErrMeta {
  oplabel:    String
  act:        String
  capacity:   SafebyokJson
  fieldnames: [String!]
  labelpaths: [String!]
}

"A vaultDB verb's answer, as the verb resolved it, less its ask."
type SafebyokAnswer {
  ok:      Boolean!
  act:     String!
  banktok: String!
  tracked: SafebyokJson!   # 'unread', or for each root its record or 'same'
  read_tc: String!
  val:     SafebyokJson    # the good answer's val: a Thing, null, BankRoots, WorldRoots or VaultStats
  dbhas:   SafebyokJson    # the Thing stored, a shell, or null
  err:     SafebyokErr     # null when ok
}
"A listing's answer: SafebyokAnswer's fields, and what a listing carries beside them."
type SafebyokListAnswer {
  ok: Boolean!, act: String!, banktok: String!, tracked: SafebyokJson!, read_tc: String!
  val: SafebyokJson, dbhas: SafebyokJson, err: SafebyokErr
  parentage:    SafebyokJson!
  deltas:       SafebyokJson!
  damaged_rows: SafebyokJson!
}
"One change a watch heard: the Thing, its bank's banktok and when it was read; or the trouble the watch met."
type SafebyokNotice {
  record:  SafebyokJson
  banktok: String
  read_tc: String
  err:     SafebyokErr
}

type Query {
  safebyokGetThing(ask: SafebyokJson!):   SafebyokAnswer!
  safebyokListThings(ask: SafebyokJson!): SafebyokListAnswer!
  safebyokGetWorld(ask: SafebyokJson!):   SafebyokAnswer!
  safebyokStats(ask: SafebyokJson!):      SafebyokAnswer!
}
type Mutation {
  safebyokWriteThing(ask: SafebyokJson!): SafebyokAnswer!
  safebyokBirthBank(ask: SafebyokJson!):  SafebyokAnswer!
}
type Subscription {
  safebyokWatchThings(scope: SafebyokJson!): SafebyokNotice!
}
```

The two answer types repeat one field block, built once in the SDL helper, as big builds its blocks.

## 3. What crosses the wire

### The wire answer mirrors the Answer (Q2)

The server sends the vaultDB's own answer, with two changes:

* **No `ask`.** The client already has the ask, and its base class builds the loggable ask itself, as every
  `AdapterVaultDB` does.
* **`err` reduced** to `SafebyokErr` (below).

A reader who knows the vaultDB answer contract (`shapes-answers.ts`) knows the wire. The resolver is a straight
map, and a host reading its network log sees the answer it would see in-process.

The client turns the wire answer into the verb's Actual:

| Verb | Good | Refused by its act |
|---|---|---|
| get | `record` is `val` under `gotlive`, else `dbhas` | `record` is `dbhas` |
| write | `record` is `val` | `record` is `dbhas` |
| list | `kids` is `val` less its `read_tc`; `parentage`, `deltas`, `damaged_rows` | `record` is `dbhas`; the three lists, empty |
| birth | `things` is `val` | `record` is `dbhas` |
| world | `things` is `val` | (only a throw refuses it) |
| stats | `stats` is `val` | (only a throw refuses it) |

Each Actual takes the wire's `banktok`, `tracked` and `read_tc`.

### A thrown refusal against a refusal by act

The answer contract already marks a verb that threw: `tracked` is `'unread'` and `banktok` is the void lifetok
(`BadAnswer`'s doc block). The client's `do*` branches on that marker alone:

* **Refused by its act** (`tracked` is a bag): the `do*` returns the Actual. The base class's `answerOf` rebuilds
  the refusal from the act, from the same tables the server used. The server's `banktok`, `tracked` and
  `read_tc` stay on the answer.
* **Thrown on the server** (`tracked` is `'unread'`): the `do*` throws the crossed refusal, rebuilt as a
  `VaultError` of its kind. Its `meta.act` is the wire's `act`, and `rows.dbhas` is the checked `dbhas`. The base
  class's `answerForThrown` then makes the same bad answer the server made, with the void banktok, `'unread'`,
  and `dbhas` from the rows. Its `read_tc` is the device's clock, not the server's: the one place a server's date
  does not cross (Q6).

### A refusal crosses as `err`, never as a GraphQL error

This is carried over from big. A refusal is data, and a GraphQL error means the client and server disagree.
`SafebyokErr` carries:

* `refusalkind`.
* `message`: the server's vaultDB refuses with static phrases.
* An allowlisted `meta`: `oplabel`, `act`, `capacity`, `fieldnames`, `labelpaths`. These name fields, labels
  and limits, never values.

It never carries:

* **`cause`.** A driver's message, such as Postgres's, stays on the server.
* **`ask`.** The client has its own.
* **`rows`.** `dbhas` crosses as the answer's own field, checked like any record, and the client lays it back on
  the rebuilt error's rows.

The schema enforces the allowlist: GraphQL serializes only the fields `SafebyokErr` declares, so a careless
resolver cannot leak a cause.

Nothing crossing is cleartext. Records hold sealed whispers and wrapped keys, exactly what the server's storage
already keeps. Labels and scope are stored in the clear in every vaultDB.

### The watch, and how `read_tc` travels (#911)

On the server, the subscription resolver:

1. checks sign-in against the scope's `userid`;
2. calls `vaultDB.watch(scope, onNotice, onBadNews)`;
3. sends each `item` event as `{ record: event.val, banktok: event.banktok, read_tc: event.read_tc }`;
4. sends each bad news as `{ err }`.

An `AdapterVaultDB` notifies `item` events alone, and the resolver sends only those. It builds nothing for any
other kind.

On the client, `doWatch` hands each `{ record, banktok, read_tc }` to `receive` unchanged. The base class's
`watch` checks it (`ActualChecks.received`, `Classifier.watchedThingOf`) and dates the notice with the server's
`read_tc`. That is Postgres's `uuidv7()` under `PostgresVaultDB`, so every device orders one Thing's notices by
one clock. A notice carrying `err` goes to `onBadNews`, rebuilt as above, and the watch goes on.

The rest is carried over from big:

* The server re-checks sign-in at every notice.
* The stream sits on a `ReadableStream` reader with `highWaterMark: Infinity`. The stream's own async
  iterator's `return` would hang.
* The client's watch ends once, never resubscribes, and skips the duplicate final result that a stream over
  fetch delivers.
* A cut stream is reported once, as `storage_unavailable`.

Retrying a stopped watch is the janitor's job (#908), not the adapter's.

Two things change from big:

* **A bad notice no longer ends the stream.** The base class reports a Thing that fails its checks and goes on.
* **An `identity_revoked` ending is reported** to `onBadNews` rather than swallowed (Q5).

## 4. Validation

* **At the client's entry.** The constructor checks `{ client }` by its interface: `query`, `mutation` and
  `subscription` functions, as big's `isGraphQLBankClient` does. The base class checks each ask before any
  `do*` runs.
* **What comes back.** First the envelope: `ok`, an `act` among the verb's acts, `banktok` as a lifetok,
  `read_tc` as a ReadTc, `tracked` as `'unread'` or a bag, and `err` as a crossed error or null. Then every record,
  through the same classifier check a concrete adapter's report goes through, at the ask's scope:
  * `storedThingOf`, or a shell at the scope, for a get's or a refused write's record;
  * `writtenThingOf` for a written Thing;
  * `writtenRootsOf` for a birth;
  * `trackedOf` for `tracked`;
  * the listed-children check for a listing;
  * the roots check for a world;
  * the stats check (#905) for stats.

  A check that fails refuses `storage_issue`, as `ActualChecks` already does. Big refused `unexpected_error` there
  (Q6).
* **Classifier checks D must export.** Some of these checks are private today: `shellAt`, `listedThingOf` and
  `rootStoredOf`, and the check of a listing's kids. D exports what it needs from the classifier, beside
  `storedThingOf`:
  * a record or shell at a scope;
  * a listing's crossed kids and lists;
  * the world's roots.

  These are new exports of the new core, free to add (`notes/transition.md`).
* **At the server's entry.** `vaultResolvers` checks its options: `vaultDB` by `isVaultDB`, and `getUserId` as a
  function. A resolver reads only the ask's `userid`, through a narrow check, for the sign-in comparison, and then
  hands the verb the ask as it came. The vaultDB's own entry checks the whole ask, as it would for any caller.
  * An ask with no valid `userid` is answered `identity_revoked`. It is not the signed-in user's, and the answer
    tells a hostile caller nothing. Our own client never sends one.
  * The answer for a sign-in refusal is a thrown-refusal answer: `'unread'`, the void banktok, `act:
    'unclassified_storing'`, as in big.
* **What the client does not re-derive.** It does not re-derive `act` or `banktok`. Both are the server's word,
  checked for shape and membership, as in big. A lying server can refuse service, which no check prevents. It
  cannot hand the device a record of another scope or a malformed Thing, and a tampered whisper fails its AEAD at
  unseal.

### Network and server trouble (carried over)

These map as in big, each thrown inside a `do*` so the base class's `answerForThrown` makes the bad answer:

* **A failed fetch** is `storage_unavailable`. Its cause names only the error's name, the HTTP status and an
  all-caps code.
* **A GraphQL error** is `unexpected_error` (the `ServerErred` phrase, no cause).
* **A missing field** is `unexpected_error` (`SchemaNotServed`).

Queries run `requestPolicy: 'network-only'`. Each of these is a named thrower in
`src/refusals/throwers.ts`, with its phrase in `src/phrases.ts`.

## 5. Carried over from `safebyok-graphql-big`

| Big | New | Note |
|---|---|---|
| `SafebyokJson` scalar | kept | `parseLiteral` should make plain bags (graphql-js builds input objects with a null prototype, which `CX.isPlainBag` may refuse); variables arrive as plain JSON |
| `SafebyokEpochMillis` | **dropped** | Times sit inside JSON records, where a safe integer is exact |
| Typed rows, `__resolveType` unions, the `passkey0: null` fix, per-selection `__typename` stripping | **dropped** | Records are JSON (Q1) |
| `crossedErr`, `vaultErrorOfCrossed` (`shapes-bank-answers.ts`) | **ported** to the new core, with `act` and `labelpaths` added to the meta | See *Package layout*; Convex may share it |
| `crossedAsk`, `askOfCrossed` | **dropped** | No ask crosses back |
| `bankResolvers`, `signinRefusalOf`, `openWatch`, `endingWith`, `crossingOf` | `vaultResolvers` and the same helpers | A straight port. `crossingOf` maps an Answer, not a bank answer |
| `GraphQLBankDB`'s `#runQuery`, `#runMutation`, `fieldOf`, `troubleOf`, `networkTroubleOf`, `statusOf`, `codeOf`, `hearNotice`, the watch's end-once logic | `GraphqlVaultDB`, the same | Answer making moves to `AdapterVaultDB` |
| `GraphQLBankClient` (a `Pick` of urql's `Client`) | `GraphqlVaultClient` | |
| `BankOperations` | `VaultOperations` | |
| README recipe: Yoga on Next.js, `maskedErrors`, Postgres behind, SSE by `fetchSubscriptions: true` or graphql-ws | the same, with `PostgresVaultDB` | *Who reaches which bank* and *What crosses the wire* are rewritten |
| `bank-resolvers.test` | `vault-resolvers.test` | Sign-in per operation and per notice, refusals reduced, no cause crossing |
| `graphql-bank-db.test` (fake urql client) | `graphql-vault-db.test` | Network and GraphQL trouble, envelope checks, thrown against act refusals |
| `bank-schema.test` (drift of every typed row against the core) | `vault-schema.test`, much smaller | The envelope against the core's answer keys; every `VaultOperations` document validates against the SDL |
| `yoga-recipe.test` | kept | The new core's `describeVaultDBBattery` (`safebyok/testing`) through Yoga over fetch |
| `test-helpers` (PGlite, `serverOver`, `browserOver`, `makeTwin`) | kept | Over `PostgresVaultDB`'s `VaultTablesSql` and `VaultFunctionsSql` |

### Guarantees loosened or dropped

* **A host's GraphQL tooling sees no record fields.** Records are `SafebyokJson`, so introspection and field-level
  gateway rules see the envelope alone (Q1).
* **An answer carries no `ask` across**, so a server log of responses no longer names the call's address. A log
  of variables still does.
* **No wire version.** A client and server from different releases fail safe, as `storage_issue` or
  `unexpected_error`, not with a negotiated error. Before 1.0.0 nothing binds backward.
* **A thrown refusal's `read_tc` is the device's**, not the server's (Q6).
* **`maxBoxes`** is gone with the bankDB. The server's vaultDB enforces its own limits, and stats report them.

## 6. Package layout and exports

`packages/safebyok-graphql/`, new beside `safebyok-graphql-big`. It copies `safebyok-indexeddb`'s packaging (the
new core's IndexedDB vaultDB once A renames it): eslint config, vitest config, tsdown, `exports.test.ts`, the
`fixed` group again.

```
src/index.ts            GraphqlVaultDB, type GraphqlVaultClient, type GraphqlVaultDBOpts, VaultOperations
src/server.ts           VaultSchemaSdl, vaultResolvers, type VaultResolversOpts
src/graphql-vault-db.ts the client
src/vault-resolvers.ts  the server
src/vault-schema.ts     the SDL and the SafebyokJson scalar
src/vault-operations.ts the seven documents
src/shapes/             the wire answer's and notice's envelope checks
src/refusals/throwers.ts, src/phrases.ts
```

Entries are `.` and `./server`, as in big.

* **Peer dependencies:** `safebyok` (never `safebyok-big`), `graphql` ^17 and `@urql/core` ^6.
* **Dev dependencies:** `graphql-yoga`, `@graphql-tools/schema`, `@urql/exchange-execute`,
  `@electric-sql/pglite` and `safebyok-postgres`. All already sit in big's `package.json`, so the build adds
  no new dependency.

**In the core:** the crossed-refusal check and its rebuild, ported from big's `shapes-bank-answers.ts`, go to
`src/shapes/` and `src/refusals/` and are exported from `safebyok/storage`. Any adapter whose server hands answers
across a wire can then share one allowlist: the new Convex adapter may (thread B). The classifier exports from §4
go there too.

## 7. The e2e plan

* **Rename.** `git mv e2e/tests/graphql e2e/tests/graphql-big` (it runs big's package over `PostgresBankDB`).
  The new suite takes `e2e/tests/graphql/`.
* **Harness.** The new core has no real-Postgres harness in e2e yet. D adds
  `e2e/tests/postgres-vault/test-helpers.ts`: a file database with `VaultTablesSql` and `VaultFunctionsSql`, a
  `pgClientOf` pool and a listening connection for each device, cut from big's `e2e/tests/postgres/test-helpers.ts`.
  It joins `OnRealPostgres`.
* **Suite** (`e2e/tests/graphql/graphql-vault-db.test.ts`), with Yoga servers on real ports, each hosting a
  `PostgresVaultDB` over one real Postgres, and `GraphqlVaultDB`s posting to them:
  * `describeVaultDBBattery` through the network;
  * a browser watching through one server hears a write made through another, over a real `LISTEN`, and its
    notice's `read_tc` is the database's `uuidv7`, after the write's own answer's;
  * the server's watch ends when the browser stops watching;
  * a closed server reports `storage_unavailable` once and is not resubscribed;
  * a browser signed in as another user is refused `identity_revoked`, per operation and on the watch;
  * a refusal thrown on the server, a policy refusal for one, crosses with its kind and meta and no cause.
* **Dependencies.** `e2e/package.json` gains `safebyok` (for `safebyok/testing`) and the new `safebyok-graphql`
  beside `safebyok-graphql-big`.

## 8. Thread split for the build

Both threads stand on the lease_shelf line with #905 and #911 in it, and on A.

* **D1 `graphql_vault`: the package.**
  * The core's ported crossed-refusal check and its rebuild.
  * The classifier exports.
  * `vault-schema`, `vault-operations`, `vault-resolvers` and `GraphqlVaultDB`.
  * The unit tests, and the battery in process: urql's execute exchange against the resolvers, over
    `PostgresVaultDB` on PGlite.
  * `exports.test`, the `fixed` group, and a changeset (`safebyok-graphql`, minor: it now runs on the new core,
    with a new wire).

  Size: large. Review `medium`, as the wire is security-bearing.
* **D2 `graphql_recipe`: the recipe and e2e.**
  * The README rewritten from `safebyok-indexeddb`'s template and big's recipe.
  * `yoga-recipe.test`.
  * The e2e rename, the Postgres-vault harness and the suite above.

  Size: medium. Review `low`.

One worker could build both, but D1 alone fills a context. Split this way, D2 can wait on D1's review without
blocking it.

## Open questions

**Q1. How typed is the wire?** The options:

* (a) Big's way: every row and ask typed, with unions.
* (b) A typed envelope, typed flat ask fields, and JSON for the nested bags.
* (c) A typed envelope, with asks, records, `tracked` and the listing lists as `SafebyokJson`.

*Recommend (c).* Our client is the wire's one reader, and it runs the core's own checks on everything that
crosses. Every typed field is a second schema to keep in step, with a drift test. Big paid for its typing with
the `passkey0` fix, `__typename` stripping and a `'main'` that could not sit in a union. The new asks key `track`
and `tracked` by `gate/main` and `box/root`, which are not GraphQL field names, so even (b) needs JSON there.

The typed envelope keeps what typing is worth here: GraphQL tooling and logs show `ok`, `act` and `err`, and the
schema itself bounds what a refusal can carry. Big's argument for typed scope arguments was that logs see whose
bank each call reaches. A log of variables still shows that. Persisted-operation allowlists match documents, not
values, so they are unaffected.

**Q2. Answer-shaped or Actual-shaped wire?** *Recommend answer-shaped* (the vaultDB's answer less `ask`, `err`
reduced). It mirrors the published contract, the resolver is a straight map, and it keeps the server's `banktok`,
`tracked` and `read_tc` on refusals by act.

The Actual shape (`record`, `kids`, `things`) would save the client a small mapping table. It would put a
protected, internal shape on a public wire.

**Q3. Does `err` cross on every bad answer, or only on a thrown one?** *Recommend every bad answer*, mirroring the
Answer. A host's network log then shows the refusal's kind and message without the act tables. The client reads it
only when `tracked` is `'unread'`. On a refusal by act, the base class rebuilds the same error from the act, so the
crossed one is redundant there.

The alternative: send `err` only on a throw, and let its presence be the discriminator. Every field that crosses
would then be read, at the cost of a log showing `act: 'stale'` with a null `err`.

**Q4. One `safebyokWriteThing`, or `safebyokPutThing` and `safebyokDelThing`?** *Recommend one*, mirroring
`tryWriteThing`. The ask's `op` already says which, and the server hands the ask to one verb. Two mutations would
add an `op` consistency check at the resolver for nothing. The gloss's "put, del" reads as the verb's two ops.

**Q5. Is a watch ended by `identity_revoked` reported?** Big swallowed it, ending the watch silently. *Recommend
reporting it to `onBadNews`.* A server that revokes a user the device still thinks is signed in is news to the
device, not intent of its own (`#lock-is-intent` covers what the device did). The janitor and the host should hear
why the watch stopped, rather than retry a dead one.

**Q6. What does a failed check of what crossed refuse, and whose clock dates a thrown refusal?** *Recommend
`storage_issue`*, the refusal `ActualChecks` and the classifier already give a datastore's bad report. To this
client, the server is its datastore. Big gave `unexpected_error`, to read as "a server out of step with this copy
of safebyok". Version skew is one cause; a damaged server is another, and `storage_issue` covers both.

On the clock: *recommend accepting the device's `read_tc` on a thrown refusal.* `answerForThrown` makes it, and
carrying the server's date through would mean a new path into the base class, for an answer that carries no record
to order.

**Q7. `GraphqlVaultDB` or `GraphQLVaultDB`?** The plan says `GraphqlVaultDB`. Big, graphql-js (`GraphQLError`,
`GraphQLScalarType`) and urql all spell it `GraphQL`. *Recommend `GraphQLVaultDB`* (and `GraphQLVaultClient`), so a
host reads one spelling across its imports. The rest of this design uses the plan's spelling until this is ruled.

**Q8. Does the crossed-refusal check live in the core?** *Recommend yes* (`safebyok/storage`). The allowlist of
what may cross is a security decision, and one copy of it should serve every adapter whose server answers across
a wire. Thread B's Convex adapter may need it too. If B already ports its own, D adopts B's rather than adding a
second.

## Approaches set aside

* **A thin server that ships raw rows, with the client classifying** (the shape of `PostgresVaultDB`'s SQL
  functions). A conditional write must be decided and done in one step on the server, so the server needs a
  vaultDB's logic anyway. Wrapping a whole `VaultDB` keeps the server one line per verb.
* **Trusting the server's records unchecked.** The server is storage, and `AdapterVaultDB`'s contract is that a
  report's records are already classified. The second check is cheap, and it runs once per answer.
* **A wire version field or negotiation.** Nothing binds backward before 1.0.0. A skewed pair fails safe.
