---
"safebyok": minor
"safebyok-fastkey": minor
---

**`safebyok/browser` exports what another key deriver needs to wear the core's specs: `Argon2idWebV1`, `parseKeyDeriverSpec` and `checkSaltFits`; `safebyok/testing` exports `makeBankWorld`, `makeBankWithVault`, `useBankWorlds`, `byPassphrase`, `Passphrase` and `VaultScopeGiven`.** **`safebyok-fastkey` now peers on `safebyok`, not `safebyok-old`,** and its derivers are `safebyok`'s own `KeyDeriver`s: same keyDeriverSpecs and labels, same bytes, refusals as the core's. A host of the new core imports `Argon2idWebV1` from `safebyok/browser`; fastkey's own exports are unchanged. **Stored format:** unchanged.
