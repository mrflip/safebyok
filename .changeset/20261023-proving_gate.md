---
"safebyok": minor
---

**Unlocks and changes to the ways in now run through provings and gates.** A passphrase or a passkey's answer becomes a `Proving` (`PassphraseProving`, `PasskeyProving`), sealed over a wayin's header, which opens, reseals and grants a lease from the vault's ways in without a vaultKey ever leaving it; a `Gate` holds a vault's ways in at one `gate_epoch`, and the vault stores one over the gate it was built on. What a host sees:

* `vault.checkStrength(passphrase)` / `tryCheckStrength` refuse a weak new passphrase as `weak_passphrase`, the checker's reason its message. `checkPassphrase` stays, for a form's live verdict.
* A new refusal kind, `gating_landed` (a condition): an ask's `attempt` under way when a `lock()` lands or the prompt is answered or declined now refuses `gating_landed`, where it refused `vault_locked`. Nothing is unlocked either way, and a cancel never locks.
* `putWayin()` and `delWayin()` whose write lands just as the vault is deleted or made anew elsewhere now refuse `vault_gone` or `vault_remade` (they resolved before); nothing is unlocked, as before.
* A change to the ways in that storage refuses after this device has heard of another device's change to them now refuses `gate_moved`, where it refused `stale_write`; one this device has not yet heard of still refuses `stale_write`.
* A passkey's answer is zeroed once it is used: hand `unlock()`, `putWayin()` and an ask's `attempt` a fresh answer each time, as `askPasskey` and `createPasskey` give one.
* `Proof`, `PassphraseProof`, `PasskeyProof`, `VaultKeyPair`, `WayinStamp`, `Wayin.seal` and `wayin.tryOpen` are gone.

Nothing stored changes shape: vaults and leases written before this release read and open as before.
