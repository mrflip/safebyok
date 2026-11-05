---
"safebyok": minor
---

A vault's gate entrypoints say that they prompt: `vault.replacePassphrase()`, `addPasskey()`, `revokePasskey()` and `delVault()` are now `replacePassphrasePrompt()`, `addPasskeyPrompt()`, `revokePasskeyPrompt()` and `delVaultPrompt()`, each with its `try` form. A host renames its calls; `unlock()` and `del()` keep their names, and the vaultDB's verbs of the same names stay as they are.
