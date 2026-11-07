---
"safebyok": minor
"safebyok-react": minor
---

safebyok-react runs on the new core: its peer dependency is `safebyok`, and `BankProvider` takes `Bank.make`'s options, makes a bank per `user_id`, says `bank.hello()`, sweeps it at a sign-out, a change of user or an unmount, and calls `bank.autolock()` each minute. The hooks are `useBank`, `useBankSnapshot`, `useVault` (now `{ stage: 'waiting' | 'unborn' | 'present', vault }`, never asking nor building: build an unborn vault with `bank.ensureVault` from a click) and `useVaultSnapshot`; `useListedVault` is gone. `GatingModal` shows `PassphraseModal` for `build_vault` and `unlock_vault` gatings and declines every other kind for now; the passkey exports (`createPasskey`, `askPasskey`, `passkeysAvailable`, `PasskeyUnlockButton`) and `allowStartOver` are gone until they return. The core exports `ForeverMillis`, the longest lease a bank keeps.
