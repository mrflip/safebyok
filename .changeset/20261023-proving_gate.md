---
"safebyok": minor
---

**Provings and gates.** A passphrase or a passkey's answer now becomes a `Proving` (`PassphraseProving`, `PasskeyProving`), sealed over a wayin's header, which opens, reseals and grants a lease from the vault's ways in without a vaultKey ever leaving it; a `Gate` holds a vault's ways in at one `gate_epoch`. `vault.checkStrength(passphrase)` / `tryCheckStrength` refuse a weak new passphrase as `weak_passphrase`, the checker's reason its message. A new refusal kind, `gating_landed` (a condition): a proof under way for a prompt that ended meanwhile -- a `lock()` landed, or it was answered -- unlocked nothing. Nothing stored changes shape: a host with vaults and leases written before this release sees them read and open as before.
