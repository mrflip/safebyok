---
"safebyok-graphql": minor
---

`safebyok-graphql` is rebuilt on the new `safebyok` core, and is now published. Its exports and its schema are new; a server and a client move together, from `safebyok-graphql-big`:

* `GraphQLVaultDB` (from `safebyok-graphql`) is a vaultDB for the browser over your urql Client: `new GraphQLVaultDB({ client })`. It replaces `GraphQLBankDB`. It checks every Thing an answer carries against its ask, as a vaultDB over a datastore does, and a refusal the server's vaultDB made reaches the browser with its kind, its message and an allowlisted meta, never its cause.
* `VaultSchemaSdl` and `vaultResolvers({ vaultDB, getUserId })` (from `safebyok-graphql/server`) serve any vaultDB, such as `safebyok-postgres`'s `PostgresVaultDB`, replacing `BankSchemaSdl` and `bankResolvers`. Each operation is one vaultDB verb with its ask as one typed input; a request reaches only the bank of the user `getUserId` signs it in as, and any other is answered `identity_revoked`.
* `VaultOperations` lists the documents the client sends, for a server that allows only the operations it knows.
* GraphQL only carries each answer. What the server's vaultDB answers, refusals and datastore failures included, reaches the browser as the bad answer it gave. A request the server could not serve, as where `getUserId` throws, or one that breaks the package's rules, as a watch scope that fails its check, fails on the server with a GraphQL error carrying the refusal under `extensions.safebyokErr`, never its cause; `GraphQLVaultDB` answers it as a bad answer of that refusal, and a watch ends with it. A GraphQL error carrying none is `unexpected_error`.
