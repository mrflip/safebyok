---
---

Empty: the new `safebyok` is private, and nothing published reaches what changed. What a host of the new core will find:

- **The bank's prompts are on `Bank`.** `device.birthBankPrompt()` is now `Bank.launchBirthBankPrompt(device)`, and four prompts join it on a bank in hand: `bank.launchUnlockBankPrompt()`, `launchReplacePassphrasePrompt()`, `launchAddPasskeyPrompt()` and `launchRevokePasskeyPrompt()`. `gatingkindVals` gains `unlock_bank`, `replace_passphrase`, `add_passkey` and `revoke_passkey`, each with its cleartexts in `CleartextsForGatingkind`. A gate change writes the main gate's next revision, and `bank.maingate` is then the gate written. Adding a passkey refuses `bad_record`, asking nobody, where the gate has one; revoking one where it has none returns at once.
- **No public method accepts a proving.** `Bank.birth` and `bank.unlockByProving` are gone from the surface: the prompts reach them privately.
- **`Gating` is exported as a type only**, from `safebyok/core` and `safebyok`: a gating is made by the bank's prompts alone.
- **`device.askUser` is public**: the host's `requestCleartext` as the device guards it, or null.
- **`bank.sweep()` disables a bank for good**, with its own `disabled` refusal, `bank.endCause`, and sweeps its lease (`lease.sweep()`). `bank.isEnabled` holds until the bank or its device is swept. `device.sweep()` does not sweep its banks yet.
- **A birth on a device swept as it lands refuses `disabled`**, where it resolved the bank locked.
- **Adding a passkey where the gate has one refuses with a message that names no method**, where it named safebyok-big's `revokePasskeyPrompt`. The refusal is safebyok-big's, and reads the same from either package.

Nothing stored changes.
