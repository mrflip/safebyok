---
"safebyok": minor
"safebyok-postgres": minor
"safebyok-convex": minor
"safebyok-graphql": minor
"safebyok-indexeddb": minor
"safebyok-react": minor
---

`applabel` is `banklabel`, and a scope names `user_id` before it: `{ user_id, banklabel, vaultlabel }`. The rename reaches every stored and host-facing name: `Bank.make({ banklabel })`, `BankProvider`'s `banklabel` prop, every scope, ask and record field, the Postgres columns, the Convex fields, and the GraphQL arguments and fields (`safebyokListVaults(user_id, banklabel)`). The order reaches everything that spells a scope in sequence: a scopepath is `vault^u1^acme^main` (an `IdbVaultDB` keys its rows `['vault', user_id, banklabel, vaultlabel]`), a `LeaseScopepath` is `[user_id, banklabel, vaultlabel]`, the Postgres primary and foreign keys are `(user_id, banklabel, vaultlabel, ...)`, and the DeviceDB's rows are keyed the same way. The stored formats moved with it: a box row's `fmt` is 5002, a vault row's 6002 and a lease row's 7002. A row written before reads as damaged or absent (the new checks refuse its `applabel`), and a host with stored data wipes it or moves it by hand: rename the field, and for Postgres and IndexedDB re-key the rows. Postgres hosts re-run `vault-tables.sql` and `vault-functions.sql` on an empty database; Convex hosts redeploy the component and clear its tables.
