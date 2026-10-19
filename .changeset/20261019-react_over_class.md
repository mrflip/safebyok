---
"safebyok-react": minor
---

useVault() now returns the vault itself, or null while nobody is signed in, and useVaultSnapshot() returns null then, rather than a stand-in snapshot. What useVault() used to hand down beside the vault moves to hooks of its own: useOpenError() for openError, retryOpen and delDamagedVault, and useWithUnlockedVault() for withUnlockedVault; the type VaultContextShape is gone, and OpenErrorShape and WithUnlockedVault are new. VaultProvider's onBadNews may now be written inline: the vault calls whichever handler the last render passed, and a new handler no longer makes a new vault. Under StrictMode the vault its rehearsal makes and closes reads nothing from storage, retryOpen() reads storage afresh, and the provider renders on the server, its hooks answering null there.
