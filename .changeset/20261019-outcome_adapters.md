---
"safebyok-postgres": minor
"safebyok-convex": minor
"safebyok-graphql": minor
---

The storage adapters pass a host's auth refusals through as Outcomes. safebyok-postgres: a statement the database refuses for want of a privilege, or by a row-level security policy (Postgres's 42501), now refuses not_permitted, the driver's error as its cause, where it was storage_unavailable. safebyok-convex: SafebyokErrorKindVals gains not_permitted, which a host's getUserId may throw as a ConvexError to refuse a signed-in user, locking nothing; every refusal the safebyok functions throw (identity_revoked, not_permitted, vault_full) now carries the ConvexError it came as for its cause, where it carried none; storage_unavailable still carries nothing of Convex's error. safebyok-graphql: a refusal crossing to the browser carries the GraphQL error as its cause; a GraphQL error with extensions.code FORBIDDEN is now not_permitted, where it was storage_unavailable; a vaultDBFor that throws a VaultError of kind not_permitted or identity_revoked crosses as that refusal, where it crossed as bad_option. No stored shape and no GraphQL type changes.
