# Thread 18: align_children (2026-11-12)

Branch `20261112-align_children`, PR #685, stacked on #683 (the line #679 → #681 → #682 → #684 →
#683, cut at 43a657d03). Justify: green: safebyok 2968, react 263, graphql 409, convex 304,
postgres 213, indexeddb 197, fastkey 43, demo 99, scripts 285, e2e 549 (at the review). After
the rework: safebyok 2966, react 262, the rest unchanged, all green.

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
  * **The lock, call by call** (second commit, then the rework's revert of most of it):
    * `bank.ensureVault` no longer demands unlocked (the Coach: "ensureVault (a harmless create or
      a get) does not"). Tests in `bank.test.ts`.
    * The public del (`Storable.del`) and a box's put (so `putExposed` and `vault.putBox`) demand
      the unlock, refusing `bank_locked`, as before this thread. Sealing still refuses `bank_locked`.
    * A listing's own put and del demand nothing about the lock, as before this thread
      (`bank-gate.test.ts`, "the vault listing's own del deletes in a locked bank").
    * `bank.del()` and `gate.del()` refuse `bad_option` (`writtenByOwnVerbs`, whose message names
      `bank.delPrompt()`).
  * **Rework (third commit).** The second commit had switched the public del and put to
    `ensureUnlocked()` (prompting), adding `ensureUnlocked()` to Vault, Box and Gate. The Coach
    (2026-11-12): "did not mean to recommend replacing demandUnlocked with ensureUnlocked. Let's
    revert to demandUnlocked", "let's keep it simple". Done as `git revert` of the second commit
    with the ensureVault part, the del refusals and their tests put back. Also: bank.del() moved
    out of the `[Prompting]` banner to `[Overriding Storable's]`; one-clause test titles; the
    VOCABULARY vault entry no longer says ensureVault needs the bank unlocked.
* **Decisions taken**
  * **Children first, then the thing's own snapshot**, so a snapshot made after its children
    align sees them settled.
  * **Empty `children` arrays, not a DummyListing**, at the leaves. They are plainer, and nothing
    needed a listing-shaped object there.
  * **The constructor no longer aligns.** receiveRecord (adopt, then align) does it.
  * **`bank.del()` and `gate.del()` refuse `bad_option`** (`writtenByOwnVerbs`) at once. Once
    `BankListing.del` worked, the inherited `bank.del` would have deleted a bank with no proof of
    the passphrase. A bank is deleted through `delPrompt()`. The gate override stops the gate
    from hydrating and demanding the unlock only to refuse anyway. The Coach kept both and set
    aside a guard on the listing's `del`: "the customer is not an adversary".
* **Deviations**
  * Empty arrays instead of DummyListing (above).
  * A disabled device's bank now refuses `LetGoInstance`, not `DeviceLetGo`. Both are of kind
    `disabled`. Three expectations in `bank-ending.test.ts` were updated.
* **Discoveries**
  * **e2e flake.** In `e2e` graphql-bank-db, "stops the server's watch once the browser stops
    watching" failed once and passed alone and in later runs. It uses PostgresBankDB and GraphQL
    only, no models.
  * `bank-controls.tsx` and `KnockKnockWidget.tsx` call `ensureUnlocked` before `ensureVault`.
    That is harmless but no longer needed.
  * **Set aside: prompting from put and del.** Tried in the second commit and reverted on the
    Coach's ruling; do not bring it back without one. It moved the prompt into DelVaultModal, the
    dev box inspector and the demo's KnockKnockToolkit, and could prompt and then refuse.
* **For the Coach**
  * **Cascade cost.** Every gate or vault snapshot change on the bank aligns every vault and box
    below it. This is cheap today, but it grows with the boxes in hand.
  * **ensureVault during an unlock's gating** now succeeds, and the unlock goes on.
  * **Dismiss order.** On a tombstone adopt, `dismissGatingAtDiscard` now runs before the align.
  * **New public surface:** `Alignable`.
