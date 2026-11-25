---
"safebyok-convex": minor
---

safebyok-convex now runs on the new `safebyok` core, its peer dependency in place of safebyok-big: `ConvexVaultDB`, a vaultDB, replaces `ConvexBankDB`, and `SafebyokVaultComponent` replaces `SafebyokBankComponent`. Its `.api({ getUserId })` builds six functions, `getThing`, `writeThing`, `listThings`, `birthBank`, `getWorld` and `watchThings`, in place of the thirteen (`ensureBank` through `watchRows`); the README serves them from `convex/safebyokVault.ts`, reached as `api.safebyokVault`. Its component keeps one new table, `things`, and reads nothing the earlier tables (`safebyok_banks`, `safebyok_gates`, `safebyok_vaults`, `safebyok_boxes`, `safebyok_tallies`) hold: each user's bank reads as absent, and Convex refuses to deploy until those tables are emptied. `safebyok-convex/test` and `safebyok-convex/testing` serve tests as before. The earlier adapter lives on, private and frozen, as safebyok-convex-big.
