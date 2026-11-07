---
"safebyok-graphql": minor
---

The GraphQL schema is typed, and `GraphQLVaultDB` is a client of it checked by the core's own answer checks. Nothing here reads the old schema: deploy the server and the browser together, from the same release.

* `safebyok-graphql/server`'s schema has one operation for each verb of a vaultDB, `safebyokTidyGone` among them, answering a `SafebyokTidiedAnswer`, and `safebyokWatch`. Each operation answers what the verb's `try*` form answers. Records, options and answers are typed fields. A sidecar, a damaged row and `err.meta` are `SafebyokJson`, and times are `SafebyokEpochMillis`.
* A refusal is the answer's `err` field, never a GraphQL error: its refusalkind, its message, and a meta holding capacity, fieldnames and call alone. Its cause crosses no wire, and no longer reaches the server's logs through the resolvers.
* The resolvers call the hosted vaultDB's own `try*` verbs, for the user the request is signed in as alone. `safebyokWatch` ends with an `identity_revoked` notice once its session is signed out, or signed in as another user.
* `GraphQLVaultDB` is a class implementing the core's `VaultDBVerbs` over your urql Client. A GraphQL error, a client and server out of step, is `unexpected_error` with no cause, so that no GraphQL error's server text reaches your logs; a failed request stays `storage_unavailable`, its cause a fresh Error holding only the network error's name, the HTTP status and a code such as `ECONNREFUSED`: never urql's CombinedError, its message, or a response's body. A watch whose stream ends, by a closing result, an error or a refusal, tells the bank's `onBadNews` once and is not subscribed again; one ended by `identity_revoked` tells nothing more.
* New exports: `VaultOperations` from `safebyok-graphql` itself (the documents a client sends), and the `CrossingAnswer` and `CrossingNotice` types from `safebyok-graphql/server`.
* The README says what a host must do when the signed-in user changes: vacate the bank and make another. A bank never follows a change of user_id.
* Breaking: the schema is rewritten, and `safebyokHeard` is gone.
* Breaking: `VaultFieldArgs` holds each root field's typed arguments, keyed by the field's name.
* Breaking: `GraphQLVaultDB` no longer extends `VaultDB`, and takes `{ client }` alone, refusing `maxRecordBytes` as `bad_option`: limits are set on the vaultDB your server hosts and hands to `vaultResolvers`.
* Breaking: the `graphql` peer range is `^17.0.0`. The scalars use graphql 17's coercion hooks, which graphql 16 ignores, so on 16 the time scalar would check nothing.
