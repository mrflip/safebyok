---
"safebyok-graphql": minor
---

**`GraphQLVaultDB` is a pipe**: it implements `VaultDB` itself, no longer extending `AdapterVaultDB`, and each verb answers what the server's vaultDB answered. It checks each answer by its form (a good answer of the verb's acts, or any refused one, each Thing by its scope and citation) and by where its Things sit (a get's or a write's at the ask's scope, a listing's parent there and its children one label under it, each root at its own labelpath, each in the ask's bank), refusing `storage_issue` otherwise. It no longer re-derives the act from the Things an answer carries: a server whose act disagrees with its Things is answered as it answered. A refused answer's refusal names the ask in its meta again. **Wire changes:** a listing's `damaged_rows` are its `incompatible_rows`, and the type `SafebyokDamagedThing` is `SafebyokIncompatibleThing`; a server and its clients move together. **Stored format:** unchanged.
