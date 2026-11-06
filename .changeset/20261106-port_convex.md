---
"safebyok": minor
"safebyok-convex": minor
---

safebyok-convex runs on the new VaultDB, and breaks: its export is the class ConvexVaultDB, a VaultDB over the component's new functions (listVaults, getVault, listBoxes, getBox, putVault, putBox, delVault, delBox, tidyGone, watchRows), and a host serves those through new SafebyokComponent(components.safebyok).api({ getUserId }), which refuses identity_revoked to a caller not signed in as the user a call names. The component's tables take new shapes, which Convex will not deploy over the old design's rows: a host clears the component's tables before upgrading. The component holds each vault to 8,000 box rows, a deleted box's tombstone counting as a row until the vault is deleted, so a put past the cap refuses vault_full even when fewer boxes are live; maxBoxes counts the same rows. The fake deployment's arrange runs a change every client hears of. safebyok/storage adds storageFailed and identityRevoked for a backend's refusals, the Checker, Checkers and objCheck makers an adapter checks its options with, and the Sidecar and WhisperJson types BoxRecord names.
