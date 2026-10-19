---
"safebyok": minor
"safebyok-indexeddb": minor
"safebyok-postgres": minor
"safebyok-convex": minor
"safebyok-graphql": minor
---

A VaultDB's updateBox now resolves the lockbox as storage holds it once the write lands, where it resolved nothing, and the base class holds that record to the check a readBox makes, refusing a malformed one as corrupt_record (the write may have landed: the adapter wrote something it cannot read back). An adapter of your own changes its doUpdateBox: it resolves the record as stored, read back in the same atomic step as the write, where it resolved true, and null where it resolved false; one still resolving true now meets corrupt_record on every lockbox write. Each adapter in this repository hands back what it wrote from its one write: Postgres RETURNING the row's columns, the Convex component's updateBox mutation the Lockbox or null (it answered true or false), IndexedDB and localVaultDB a read in the write's own transaction or turn, and over GraphQL the safebyokUpdateBox mutation the SafebyokLockbox (it answered Boolean!), so a host's GraphQL server and its browsers move to this version together, as do a Postgres route recipe's two halves. Nothing stored changes. Vault.storeBox() is unchanged, and its doc block now says which errors can arrive after its write has landed.
