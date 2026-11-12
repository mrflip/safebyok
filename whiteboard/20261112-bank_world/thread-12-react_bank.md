# Thread 12: react_bank (2026-11-12)

Branch `20261112-react_bank`, PR #681, stacked on #677 (thread 10, merged). Justify green: core
3388, react 263, demo 99, fastkey 43, indexeddb 378, postgres 433, convex 508, graphql 409, e2e
549, scripts 285.

Src lines (`git diff --numstat -M`): safebyok-react +204 −153; demo +57 −62; safebyok +19 −62.

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
* **Built** (commit 3, `vault:`): the Vault's scaffolds are gone: `isLocked` (now `protected`,
  see Deviations), `isUnlocked`, `lock`, `ensureUnlocked`, `unlock`, the three wayin prompts and
  their try forms; `VaultSnapshot.isLocked`. `Storable.alignLock()` is `lock()`. Every test, the
  core README's two recipes (and their mirror in `readme-recipes.test.ts`), VOCABULARY's *locked*,
  *ensure*, *gating* and *vault* rows, STYLE's condition triplet and the `PasskeyAlreadyAdded`
  phrase name the bank and its main gate. A second changeset (`-2`) for `safebyok`.
* **Built** (commit 4, `docs:`): TODO *Soonish*, "Should there be a notification for vacate,
  delete, sweep and lock events?" (the Coach, via the orchestrator).

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
* **The provider got simpler**: building and deleting a bank need nothing of it. They are the
  device's one open gating, which `OpenGatingDialog` renders, and `device.bank` going null.

## React costs, itemized

* Provider: −1 closure (`tellBadNews`) and its branch, −`Deviceless`/`tellNobody`, −2 exported
  types; the context value is the device. State unchanged (one `useState` for the device).
* `useVaultFor`: +1 effect dependency (`vaultTok`) and +1 branch (the life already watched); the
  per-render `WeakSet` became a module-level `WeakMap`. Stages: same count, renamed.
* `CreateVaultButton`: +2 awaits (`ensureBank`, `ensureUnlocked`) and a try/catch; −its "disabled
  until present-or-absent" branch. `BankLockControl`: −1 prop, same state (none).
* `ModalForm`: +1 prop, +1 attribute branch; `showWhileMounted`: +1 line.
* `DelBankModal`: +1 component, one `useActionState` (through `useAttemptAction`).
* Demo `AccountMenu`: −`isConfirming` state, −`DelVaultModal`; +1 async branch (bank in hand or
  not) in *Delete account*. Knock flows: +1 await each (`ensureBank`) in Save / Add key.

## Deviations

* `Vault.isLocked` is `protected`, not deleted: `Storable`'s `demandUnlocked` and
  `demandDeletable` read the abstract `isLocked`. It answers `this.bank.isLocked`.
* The rename makes `vault.lock()` and `box.lock()` public calls that lock nothing: they only bring
  the thing up to its bank's lock. A host's old `vault.lock()` still compiles and silently stops
  locking; the changeset says so. Tests that called it to lock were found by a temporary rename.
* No `eslint-disable` or `ts-expect-error` added.

## Discoveries

* `world.bankOnAnotherDevice()` builds a bank if none is stored, which raced a test that wanted
  this device to build it: wait for the lock control first.
* A click on Create vault / Save / Add key while the provider's `ensureBank` is mid-build can
  refuse `already_asking` (the LabsPage flake). In a browser the build dialog is modal and the
  click cannot land. Not fixed (rules 1 and 2).
* A Vault's snapshot no longer changes at a lock (it has no `isLocked`), so a component reading
  only `useVault` does not repaint at a lock; read `useBankSnapshot` for the lock.
* `Listing.#takeDown` on a `BankListing` now calls `bank.lock()` (it called the align duty
  before); reached only for a damaged list row.
* Historic notes (design-models.md, design-proof.md, expose_improves_security.md,
  reference-timings.md) and `notes/guarantees.md` still name `vault.lock`/`ensureUnlocked`: left.

## Set aside

* Dropping `NoDialog` (every kind now has a dialog): kept, as a core newer than this package would
  leave an unknown gating open forever, blocking every other gating on the device.
* React's `autoFocus` on Cancel: React calls `focus()` itself and never writes the attribute, so a
  browser's `showModal()` focuses the first control after it. Hence `data-takes-focus`.
* A `VaultControls` that lists the vault's boxes: read "the vault's boxes" as what stays the
  vault's (making it, for its boxes), not as a new component.
* An automatic `ensureBank` in the provider after a delete or a cancelled build (see 8c's (3)).

## For the Coach

* `vault.lock()` / `box.lock()` as the align duty's public name (the directed rename): a host
  reading `vault.lock()` expects a lock. Mark it `@internal`, or give it another name?
* The dialogs of two providers do not name the bank asking; the hidden username field carries it.
* The demo's *Delete account* in the brief load before the bank is in hand takes the plain-confirm
  path, which deletes the account and leaves a stored bank.
