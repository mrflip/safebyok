---
"safebyok": minor
"safebyok-indexeddb": minor
"safebyok-postgres": minor
"safebyok-graphql": minor
"safebyok-convex": minor
"safebyok-react": minor
---

Refusal kinds now follow who is at fault. A record read from storage that fails its checks is damaged at the VaultDB layer as at the vault's: `VaultDB.getBox` refuses `damaged_box`, and `VaultDB.getVaultProps` and `ensureVaultProps` refuse `damaged_vault` (each was `corrupt_record`), Zod's own error the `cause`; `localVaultDB` reads a row that is not JSON as damaged too. A box that will not open is `damaged_box` at once: `getWhisper()` no longer reads storage again first, so a box written by a vault deleted and made anew on another device is `damaged_box` (it was `vault_locked`), and `hello({ staleMinutes: 0 })` then relocks the device. `corrupt_record` now means only that a storage adapter answered in a shape its protocol does not allow (a box write's echo, a stale or full refusal missing what it must carry, a deletion's report, a capacity), and its family is now `misuse` (it was `condition`). A host that branched on `corrupt_record` from a VaultDB read branches on `damaged_box` or `damaged_vault` instead.
