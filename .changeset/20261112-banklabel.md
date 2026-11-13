---
"safebyok": minor
"safebyok-postgres": minor
"safebyok-convex": minor
"safebyok-graphql": minor
"safebyok-indexeddb": minor
"safebyok-react": minor
"safebyok-fastkey": patch
---

`applabel` is `banklabel`, and a scope names `user_id` before it: `{ user_id, banklabel, vaultlabel }`. The rename reaches every stored and host-facing name: `Device.make({ banklabel })`, `BankProvider`'s `banklabel` prop, every scope, ask and record field, the Postgres columns, the Convex fields, and the GraphQL arguments and fields. The order reaches everything that spells a scope in sequence: a scopepath is `vault^u1^acme^main`, the Postgres primary and foreign keys are `(user_id, banklabel, ...)`, and the IndexedDB and DeviceDB rows are keyed the same way. **Stored format:** a row written before is not read. IndexedDB looks its rows up under the new keys, so an old row is never found, and Postgres and Convex check each row, so one with an `applabel` reads as damaged. Nothing is worth moving by hand: the bank design later in this release reads none of the old rows. The removal of the vaultDB says what each store does with them.
