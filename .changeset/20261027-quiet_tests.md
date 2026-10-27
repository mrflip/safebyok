---
"safebyok": minor
---

safebyok/testing gains TH.quietLogger, a VaultLogger that swallows log and passes warn and error to the console, bar the notice a test_ key deriver draws. TH.memoryVaultOpts now logs through it, so a test of yours that opens a vault from it no longer prints that notice on every Bank.make; pass logger: TH.spyLogger().logger to keep what a vault says, or any logger of your own.
