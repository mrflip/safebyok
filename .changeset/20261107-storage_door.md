---
"safebyok": minor
"safebyok-postgres": minor
"safebyok-graphql": patch
"safebyok-convex": patch
"safebyok-indexeddb": patch
---

**A salt is 16 to 32 bytes.** A host's deriver spec asking for fewer than 16 or more than 32 `salt_bytes` is refused at setup, where 1 to 65,536 were allowed; a stored passphrase wayin whose `salt_b64` is not 22 to 43 base64url characters (16 to 32 bytes; the deriver makes 16) now fails the record's check, so an older vault written with a shorter or longer salt reads as damaged. **`safebyok/storage` exports the sentences an adapter's own refusals say** (`NoBrowserStore`, `TransactionAborted`, `DatabaseClosed`, `StorageWithheld`, `BrowserStoreFailed`, `SchemaNotServed`), kept with the core's phrases. **`vaultChannelOf(user_id)` in safebyok-postgres refuses `bad_option` for a user_id that fails the core's check**, where it made a channel name of anything. **safebyok-graphql's resolvers refuse a request not signed in as the user it asks for with the core's `identity_revoked` sentence,** worded as the other adapters' are. The box cap, `maxBoxes`, is documented as best effort in every adapter's README; nothing about how it counts changes. safebyok is not yet released, so none of this keeps a compatibility layer.
