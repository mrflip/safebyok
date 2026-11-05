---
"safebyok": minor
---

A vault's gate entrypoints say that they prompt: `vault.replacePassphrase()`, `addPasskey()`, `revokePasskey()` and `delVault()` are now `replacePassphrasePrompt()`, `addPasskeyPrompt()`, `revokePasskeyPrompt()` and `delVaultPrompt()`, each with its `try` form. A host renames its calls; `unlock()` and `del()` keep their names, and the vaultDB's verbs of the same names stay as they are.

Bad news goes straight to the bank. A host's `onBadNews` on `Bank.make` hears what it heard, in the order it heard it. `bank.tellBadNews()` and `vault.tellBadNews()` are new; `listing.tellBadNews()` is gone: a listing hands its news to its world, a bank or a vault.

`Gating.launch` no longer takes a `run`: a gating's change is its own, by kind. `LOCKED`, `LockedBag`, `IsListing` and `isListing` move from the shapes to `helpers/consts`, and are still not on the package's entry points.
