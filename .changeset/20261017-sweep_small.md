---
'safebyok': minor
'safebyok-graphql': minor
'safebyok-postgres': patch
'safebyok-convex': patch
'safebyok-indexeddb': patch
---

**`safebyok-postgres`: the README's hard-cap trigger recipe is gone.** Its SQL, and the repository's tests of it, are deleted; in its place the README gives a short prompt a host pastes to its coding agent, which reads the library and writes the trigger for the host, explaining the trade-offs (the lock it takes, what the connections' isolation level does to it, and that its refusal surfaces as `storage_unavailable`, not `vault_full`). The package's own `maxLockboxes` limit is unchanged: still a best effort. A host that copied the old trigger owns it and its tests; this release's entry "The vocabulary reform, in one place" says what becomes of it when the tables are dropped.

**`safebyok-graphql`: `VaultOperations` is exported** from the package entry, the GraphQL documents `graphqlVaultDB` sends by the root field each asks for, for a host whose server accepts only persisted (allowlisted) operations. They change only as the SDL does, and are versioned with the package. The README also says that client and server move in step, and that `unlock_epoch` and `vault_key_epoch` are held to GraphQL's 32-bit `Int`.

**`safebyok-convex`: `SafebyokComponent.api` calls `getUserId` as a method of the bag it was given**, so a `getUserId` that leans on `this` works, where it used to fail on every request. A bag that is not an object holding a `getUserId` function is still refused at setup as `bad_option`.

**`safebyok-indexeddb`: `inspectIdbVaultDB` reads and wipes the shelf through the package's own `settle`**, as the vault's calls do, so a failed IndexedDB request rejects with a real `Error`, never `null`.

**`safebyok`: a label of millions of characters is refused, not thrown at.** `LabelPattern` (and so `Label`) was a regular expression with a repeated group, which overflowed V8's stack on a label that long and threw a `RangeError` out of `safeParse`. It matches the same labels as a pattern without the group; its `source` is a different string, and still suits an HTML input's `pattern`. `safebyok/testing` gains `aWhile`, `eventually`, `changeCounter` and `liveWatch`, which two adapters' tests kept copies of; `beforeNextCall` no longer hides a spy on the target's prototype after the intercepted call; and `perUser`'s example is the call the adapters' tests make. `mask`'s doc block says that `maxLen` wins over `minStars`.
