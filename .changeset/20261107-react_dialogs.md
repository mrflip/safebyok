---
"safebyok-react": patch
---

`GatingModal` answers a `replace_passphrase` gating, asking for the passphrase in use and a new one, typed twice, and a `del_vault` gating, asking for the passphrase; so `vault.replacePassphrasePrompt()` and `vault.delVaultPrompt()` show the provider's own dialog where they were declined unasked. Passkey gatings are still declined unasked.
