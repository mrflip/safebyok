---
"safebyok": minor
"safebyok-react": minor
"safebyok-convex": minor
"safebyok-indexeddb": minor
"safebyok-postgres": minor
"safebyok-graphql": minor
---

A row out of storage is now held to the address asked for, and the public surface changed. `Damagekind`, the `damagekind` field, `format_mismatch` and `isNewerFormat` are gone, as is `fmtPeek` from `safebyok/storage`: a `DamagedBox` or `DamagedVault` in `damaged_rows` now holds only its scope, a box its `vault_tok`, and `am: 'd'`, so read no revision, time or `fmt` from one. A well-formed row whose own `applabel`, `user_id`, `vaultlabel`, `boxlabel` or (for a box) `vault_tok` is not the one asked for, or a row that is not an object at all, now refuses the new kind `storage_issue` (family `bad_news`): the database is so broken that a retry is unlikely to help. A row that is an object but fails its checks is still set aside as damaged. Either refusal from a listing fails the whole listing, so `vault.hello()` fails with it.
