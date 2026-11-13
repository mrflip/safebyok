---
"safebyok-react": minor
---

safebyok-react works at the bank's level. VaultLockControl is BankLockControl, with no props: the lock is the bank's, read from useBankSnapshot. CreateVaultButton brings up, builds or unlocks the bank before it puts the vault, so a user who cancelled the bank's dialog at sign-in, or a returning user on a new device, gets a vault from one click. useVault's stages are bankless, absent, present and spent (waiting and unborn are gone): bankless also covers a bank deleted or never built. The provider shows a built-in DelBankModal for a del_bank gating, and a vault's watch begins again at each new life. DelVaultModal focuses Cancel as it opens.
