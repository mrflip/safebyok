---
"safebyok-graphql": minor
"safebyok-big": minor
---

**safebyok-graphql carries a bankDB, in place of the vaultDB: `BankSchemaSdl` and `bankResolvers({ bankDB, getUserId })` on the server, `GraphQLBankDB` and `BankOperations` in the browser.** `VaultSchemaSdl`, `vaultResolvers`, `GraphQLVaultDB` and `VaultOperations` are gone, and so are their types (`GraphQLVaultClient` and the rest, now `GraphQLBankClient`, `BankResolversOpts`, `BankFieldArgs` and so on). The schema has one operation per bankDB verb: `safebyokEnsureBank`, `safebyokBuildBank`, the three gate verbs (each taking a gate's ask), `safebyokDelBank`, the vault and box verbs (each ask citing its `bank_tok`), `safebyokTidyGone` and `safebyokWatch`; every answer carries `parent`, the row above, in place of `world`. A host serves the new schema from a server hosting an `AdapterBankDB` such as `PostgresBankDB`, and deploys both halves together: a browser on the old schema is refused as `unexpected_error`. In safebyok, a `delBank` answer that crosses a wire without its `parent` reads it as null.
