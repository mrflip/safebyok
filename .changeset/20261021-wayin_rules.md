---
"safebyok": minor
---

**A new passphrase removes the passkey.** A vault has one passphrase and at most one passkey, matched to it. `vault.putWayin(passphrase, newPassphrase)` now writes the vault with no passkey: the user adds one again, proving the new passphrase. Warn the user before they change the passphrase. A passkey's answer still replaces the passkey and leaves the passphrase as it stood.

**`putWayin` resolves the way in as stored.** `vault.putWayin()` (and `tryPutWayin`'s `val`) is now the new way in's summary, as `vault.passphrase` or `vault.passkey` shows it, not the vault. `delWayin` still resolves the vault.

**A blank passphrase is refused for what it is used as.** A blank new passphrase, the one `unlock()` creates a vault with as well as `putWayin`'s new one, is refused `weak_passphrase` before the strength checker hears it. A blank one offered as proof (to unlock a vault that stands, or to prove a change) is refused `wrong_passphrase`, deriving nothing, once the vault has been read. `Proof.parse` no longer refuses a blank passphrase.

**The strength check belongs to the passphrase.** The vault has a public `strengthChecker` getter, and `PassphraseProof` has `checkStrongEnough()`, which puts the passphrase to its vault's checker. `ProofVault` now names `strengthChecker` and the scope, and `WayinVault` names `clock`: a stand-in for either carries them. With no `strengthChecker`, every new passphrase is still refused as too weak, but nothing is logged: the refusal's message says the checker is missing and points to CUSTOMIZATION.md.

**`Wayin.seal(vault, vaultProps, proof, deviceId, vaultKey)` stamps the way in itself and resolves only the way in.** It takes the device id in place of a stamp, and reads the epoch from the vault props and the time from `vault.clock`. It no longer refuses a passkey's answer over a misshapen salt: the vault checks that at its door. Creating a vault now takes its key out of the way in as stored, as any unlock does, so it costs a second key derivation.

No stored shape changed.
