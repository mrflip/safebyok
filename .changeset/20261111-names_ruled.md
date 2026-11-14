---
"safebyok-big": minor
"safebyok-react": minor
"safebyok-fastkey": minor
"safebyok-graphql": minor
"safebyok-convex": patch
"safebyok-postgres": patch
"safebyok-indexeddb": patch
---

**Renamed exports, with no change in behaviour.** A host that imports one of these renames it. Nothing stored changes.

- `safebyok`:
  - `Gating.checkStrength` is `judgeStrength`.
  - `Box.isFUBag` is gone: use `isWhisperedBag`.
  - `PassphraseSaltBytes`, `PasskeySaltBytes` and `PrfAnswerBytes` are `PassphraseSaltSize`, `PasskeySaltSize` and `PrfAnswerSize`.
  - `DefaultMaxRecordBytes` is `DefaultMaxRecordSizeEst`.
  - A `KeyDeriver`'s `salt_bytes` is `salt_size`, and a key deriver spec's `output_bytes` is `output_size`.
  - The `ModelkindClasses` type is `ClassForModelkind`.
- `safebyok/browser`: `argon2idDeriver` is `makeArgon2idDeriver`.
- `safebyok/storage`:
  - An adapter's `maxRecordBytes` option is `maxRecordSizeEst`.
  - `sentinelVaultOf` and `sentinelBoxOf` are `shellVaultOf` and `shellBoxOf`.
  - `foundVaultRow` and `foundBoxRow` are `storedVaultRowOrNull` and `storedBoxRowOrNull`.
  - `storageTroubleOf` is `storageRefusalOf`.
- `safebyok-react`: `attemptOnce` is `attemptThenZero`.
- `safebyok-fastkey`: `argon2idWasmDeriver` is `makeArgon2idWasmDeriver`.
- `safebyok-graphql`: the `userIdOf` option of `vaultResolvers` is `getUserId`, as Convex's is.
