# Thread 12: react_bank (2026-11-12)

Branch `20261112-react_bank`, PR #TBD, stacked on #677 (thread 10). Justify: TBD.

* **Built** (commit 1, `client:`): `safebyok-react` at the bank's level, and the demo with it.
  * The lock is the bank's. `VaultLockControl({ vaultlabel })` is `BankLockControl()`, no props,
    reading `useBankSnapshot().isLocked`, unlocking by `bank.tryEnsureUnlocked()`, locking by
    `bank.lock()`; nothing while there is no bank. `components/vault-controls.tsx` is
    `components/bank-controls.tsx`; `VaultControlProps` is `CreateVaultButtonProps`.
  * `CreateVaultButton` ensures each step from one click: `device.ensureBank()` (fetches, or asks
    `build_bank`), `bank.ensureUnlocked()` (the lease, or asks `unlock_bank`), `bank.ensureVault`.
    Enabled whenever a device exists.
  * `useVault`'s stages are `bankless | absent | present | spent` (were `waiting | unborn | ...`).
  * The context value is the `Device | null` itself (undefined outside a provider).
    `ContextValue`, `TellBadNews`, `Deviceless` and the provider's `tellBadNews` wrapper went:
    components call `device.tellBadNews`, which tells the host only while the device is enabled.
    `watchedVaults: WeakSet<Vault>` is a module-level `WeakMap<Vault, string>` of the `vault_tok`
    watched, so a vault's new life gets `vault.tryBeginWatch()` again (10's handoff).
  * `DelBankModal`, the built-in dialog for `del_bank` (passphrase, "Delete everything").
    `GatingModal` keeps `NoDialog` for a kind a newer core may open.
  * `DelVaultModal` focuses Cancel as it opens (thread 7's review left it to 12):
    `ModalForm`'s `cancelTakesFocus`, and `showWhileMounted` focuses `[data-takes-focus]` after
    `showModal()`.
  * Dev box inspector: the bank's lock and its `ensureUnlocked`/`lock`.
  * Demo: `AccountMenu` shows `BankLockControl`, `CreateVaultButton` while the vault is absent;
    *Sign out* is `device.vacate()` (was `bank.lock()`); *Delete account* is `bank.tryDelPrompt()`
    through `DelBankModal`, a plain `confirm` only with no bank in hand. `WaysIn` shows whenever a
    bank is in hand, and calls `bank.maingate.try*Prompt()`. The three knock flows' Save / Add key
    go through `device.ensureBank()`.
* **Next** (commit 2, `vault:`): delete `Vault`'s scaffolds and `VaultSnapshot.isLocked`; rename
  `alignLock()` to `lock()`.

## Decisions taken

* **Stages.** `unborn` is `absent`: a vault is no longer born through a gating; `bank.ensureVault`
  puts it. `waiting` is `bankless`: with a bank that can be unbuilt (a cancelled `build_bank`) or
  deleted, "waiting" was wrong in two cases of three. `useVault` cannot tell a bank still coming up
  from one not built (the device's snapshot says `made` for both), and a host acts the same on
  both: its create control calls `device.ensureBank()`.
* **8c's open questions.** (1) `CreateVaultButton` over a locked bank unlocks first. (2) A
  cancelled `build_bank` at sign-in: any control that needs a bank calls `device.ensureBank()`,
  which asks again; the provider does not re-ensure by itself. (3) After a delete or a newer life,
  the same: no automatic `ensureBank` (after a delete it would pop a "choose a passphrase" dialog
  at once); the next control press brings up or builds the bank. (4) `del_bank` gets a dialog.
* **Two providers, two banks, two gatings open**: each provider has its own Device and renders its
  own gating's dialog; hooks read the nearest provider. Both native modals are open at once, the
  later one on top in the browser's top layer; each attempt concludes its own gating (tested in
  `bank-provider.test.tsx`). The dialogs do not say which bank asks.

## Set aside

* Dropping `NoDialog` (every kind now has a dialog): kept, as a core newer than this package would
  leave an unknown gating open forever, blocking every other gating on the device.
* React's `autoFocus` on Cancel: React calls `focus()` itself and never writes the attribute, so a
  browser's `showModal()` focuses the first control after it. Hence `data-takes-focus`.
* A `VaultControls` that lists the vault's boxes: read "the vault's boxes" as what stays the
  vault's (making it, for its boxes), not as a new component.
