---
"safebyok-big": minor
---

**A bank's calls ask for a scope.** `bank.vaultOf` is now `bank.vaultAt`. `VaultBag` is `BankedVaultScope`, which requires the `vaultlabel`, and `BankBag` is gone. A `Vault` or a snapshot still passes as a duck, and a store handed in the scope is refused. The entry point now exports `BankedVaultScope` and `VaultScope`.

**`box.veil()` is new, and the `box.whisper` setter is gone.** `box.veil()` overwrites the whisper held on the instance. To hold a stored whisper, call `box.expose()`.

**`box.put` and `tryPut` answer the box they were called on**, typed `this`. `vault.putBox` and `boxListing.create` still answer a `Box`.

**Message changed:** a store in a scope.
