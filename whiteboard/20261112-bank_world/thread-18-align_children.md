# Thread 18: align_children (2026-11-12)

Branch `20261112-align_children`, PR #685, stacked on #683 (the line #679 → #681 → #682 → #684 →
#683, cut at 43a657d03). Justify: green: safebyok 2968, react 263, graphql 409, convex 304,
postgres 213, indexeddb 197, fastkey 43, demo 99, scripts 285, e2e 549.

* **Built**
  * **One align** (`storable.ts`). `align()` is `alignChildren()` then the thing's own snapshot. Every
    Storable names its `children: readonly Alignable[]`: for a Bank, `[gateListing, vaultListing]`;
    for a Vault, its box listing if one is in hand; for a Box or a Gate, `[]`. `Listing.align()`
    ends the watch of a listing that is no longer enabled (`goodbye()` is idempotent), then aligns
    each listed thing. This replaces `alignLock`, `Bank.#alignAll`, `Listing.lock()` and
    `Vault.#letBoxesGo`. `bank.lock()`, `#attachLease` and the lease's revocation each just call
    `this.align()`. Everything stays synchronous.
  * **A deleted vault's boxes** (`box.ts`, `vault.ts`). A box listing's `isEnabled` is
    `vault.isEnabled && vault.vault_tok === this.vault_tok`. A tombstone carries a new vault_tok, so
    the old listing's align ends its watch, and `Box.align` unexposes a disabled box. The Vault's
    `boxListing` getter makes a fresh listing when the tok has moved. Tests:
    `vault-boxes.test.ts`, "the boxes of a vault deleted" (one deleted here, one tombstoned through
    the watch). Both fail without Box.align's unexpose.
  * **One-line guards.** `demandEnabled()` is `if (! this.isEnabled) throw instanceDisabled()`
    once in Storable and once in Listing. The overrides are gone.
  * **`BankListing.delBank` → `Listing.del`.** `tombstoneOver` and `doTryDel` are implemented,
    and the `del_bank` gating calls `bank.listing.del(ante)`.
  * **The Coach's lock ruling** (second commit):
    * The public del (`Storable.del`) and a box's put (so `putExposed` and `vault.putBox` too)
      call `ensureUnlocked()` first.
    * A listing's own put and del demand nothing about the lock.
    * `bank.ensureVault` no longer demands unlocked.
    * Sealing still refuses `bank_locked`.
    * Vault, Box and Gate gain `ensureUnlocked()`, which calls the bank's only when the bank is
      locked. Tests for each of the four are in `bank-gate.test.ts`, `bank.test.ts`,
      `vault-boxes-putting.test.ts` and `vault-boxes.test.ts`.
* **Decisions taken**
  * **Children first, then the thing's own snapshot**, so a snapshot made after its children
    align sees them settled.
  * **Empty `children` arrays, not a DummyListing**, at the leaves. They are plainer, and nothing
    needed a listing-shaped object there.
  * **The constructor no longer aligns.** receiveRecord (adopt, then align) does it.
  * **Vault, Box and Gate `ensureUnlocked` skip the gate fetch when already unlocked.**
    `Bank.ensureUnlocked` fetches the main gate first, and proof.test "the BankDB goes out of
    reach" relies on that. Paying that fetch on every box put was too dear, so the three guard
    with `isLocked` instead.
  * **`bank.del()` and `gate.del()` refuse `bad_option`** (`writtenByOwnVerbs`) at once. Once
    `BankListing.del` worked, the inherited `bank.del` would have deleted a bank with no proof of
    the passphrase. A bank is deleted through `delPrompt()`. The gate override stops the gate
    from prompting for an unlock and then refusing anyway.
* **Deviations**
  * Empty arrays instead of DummyListing (above).
  * A disabled device's bank now refuses `LetGoInstance`, not `DeviceLetGo`. Both are of kind
    `disabled`. Three expectations in `bank-ending.test.ts` were updated.
* **Discoveries**
  * **e2e flake.** In `e2e` graphql-bank-db, "stops the server's watch once the browser stops
    watching" failed once and passed alone and in later runs. It uses PostgresBankDB and GraphQL
    only, no models.
  * **Callers whose prompt the ruling moves** (they prompted on a locked bank, or refused
    `bank_locked`, and now prompt):
    * safebyok-react `devmode/dev-box-inspector.tsx`: putBox and delBox.
    * `DelVaultModal`: vault.del. Its test is restated: a locked bank unlocks, then deletes; a
      failed unlock shows the refusal in place.
    * The demo's `KnockKnockToolkit.tsx`: putExposed.
    * `bank-controls.tsx` and `KnockKnockWidget.tsx` still call `ensureUnlocked` before
      `ensureVault`. That is harmless but no longer needed.
  * The test helper `delUnlocked` (vault-world) now does what `vault.del` does alone. It was left
    as it is.
* **For the Coach**
  * **Cascade cost.** Every gate or vault snapshot change on the bank aligns every vault and box
    below it. This is cheap today, but it grows with the boxes in hand.
  * **Prompt order.** `del` and `put` hydrate before they prompt. A disabled box under an enabled,
    locked bank could therefore prompt before it refuses `disabled`.
  * **ensureVault during an unlock's gating** now succeeds, and the unlock goes on.
  * **Dismiss order.** On a tombstone adopt, `dismissGatingAtDiscard` now runs before the align.
  * **New public surface:** `Alignable`, and `ensureUnlocked()` on Vault, Box and Gate.
