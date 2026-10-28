---
"safebyok": minor
---

**Gatings join only what answers them, more refusals are correctable, and the bank keeps one place per vault.** What a host sees:

* `ensureUnlocked()` (and so every box call) joins a standing `unlock_vault` or `initialize_gate` gating and hears its answer; it waits out a change to the ways in or a deletion, whatever that settles with, and then asks for itself only if the vault is still locked. Declining "add a passkey" no longer refuses a `getWhisper` waiting behind it. A joined unlock that took up a lease ending within the call's own `renewMinutes` has the call ask again for itself. A call raises at most one gating of its own.
* `putWayin('passkey')` on a `novel` vault refuses `absent_vault`, asking nothing: set the passphrase first (`ensureUnlocked()`'s `initialize_gate` takes a passkey beside it).
* `absent_wayin`, `damaged_wayin` and `passkey_unavailable` join `CorrectableKindVals`: an attempt meeting one leaves the gating open, as `wrong_passphrase` does.
* A first passphrase set through `ensureUnlocked()` when this device's store would not keep the unlock now refuses `storage_blocked` or `storage_unavailable`, saying the passphrase was set (it refused `vault_locked`); through `putWayin` it still resolves, and the logger warns.
* `bank.ensureVault(draft)` refuses `bad_option` for a draft naming another `vaultDB` or `deviceDB` than the vault the bank holds, or is birthing, was born from. A Vault object found gone before its birth settled is never handed out: the entry is `refused`.
* A host `requestCleartext` that throws once a deletion's write is sent no longer stops `del()` from resolving when the deletion lands.
* A `requestCleartext` that throws refuses its calls `unexpected_error` with no `cause`: what it threw may quote the passphrase. The logger hears only that it threw (`call: 'requestCleartext'`).
* A lock or a decline landing while an attempt waits on the device store or the key deriver, which then fails, now refuses the attempt `gating_landed`, not the failure; an attempt whose gating a lock settled first resolves that refusal, never success.
* A change to the ways in whose grant this device's store refused now shows the vault `locked` here at once, rather than `unlocked` under the old gate's lease.
* `del()` says hello first, so a stale `novel` picture of a vault gated elsewhere no longer refuses `absent_vault`.
* `PassphraseProving.seal` and `PasskeyProving.seal` take `{ gating }` always (the classes are exported as types only).

Nothing stored changes shape.
