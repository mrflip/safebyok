---
"safebyok-big": minor
---

**The front door exports what a UI over the vault needs.** `correctablekindVals` lists the refusal kinds that leave a gating open for another try (`wrong_passphrase`, `wrong_passkey`, `weak_passphrase`, `same_passphrase`). The types `Gatingkind`, `LockState`, `BankStage`, `Wayinkind`, `Damagekind`, `DamagedBox` and `BoxSparse`, and the wayin headers a gating's `passkeyHeader` carries (`WayinHeader`, `PasskeyWayinHeader`, `PassphraseWayinHeader`), and `PasskeyAnswer`, which a gating takes as `passkeyClear`. The constants `PasskeySaltBytes`, `PrfAnswerBytes` and `MinuteMillis`. `HostErrorSanitizer`, whose `refusalFor(foreign, kind, message)` makes the VaultError to throw in place of a foreign throw, carrying nothing of it. Additive: no behaviour changes. **Stored format:** unchanged.
