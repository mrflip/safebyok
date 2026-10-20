---
"safebyok": minor
---

**`Vault` is a class.** `Vault.make(opts)` is called as before and returns an instance of `class Vault`: the `Vault` type and the `{ make }` value beside it are gone, and the class is both. Every method is bound to its vault, so `useSyncExternalStore(vault.subscribe, vault.getSnapshot)` and `const { unlock, getBox } = vault` work as before. Behaviour, the snapshot and every stored record are unchanged. A host may notice it in its types alone: the class holds private fields, so an object literal no longer passes for a `Vault` (a test double is cast, `as unknown as Vault`); its methods are typed as properties, so a function put in place of `vault.unlock` takes every proof `unlock` takes (`string | PasskeyProof`), not a passphrase alone; and its constructor is private: `Vault.make` makes a vault.
