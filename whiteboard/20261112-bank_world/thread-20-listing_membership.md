# Thread 20: listing_membership (2026-11-13)

Branch `20261113-listing_membership`, PR #691, stacked on #689 (bank_tidy, at 94c6b57e0). Justify: green
(safebyok 2969, react 262, demo 99, e2e 549, graphql 409, convex 304, postgres 213, indexeddb 197, fastkey 43,
scripts 287). The branch's `sprintbase` config was 9d0495ecc, a pre-restack bank_tidy; the worktree was reset to
94c6b57e0 (origin's #689) before any work, and the config set to match.

Built from the Coach's five answers to the Closer Look (2026-11-13), as the orchestrator read them.

* **Built**
  * **A deleted vault is delisted** (`vault.ts`). `Vault.isEnabled` is `super.isEnabled && this.isPresent`, and
    `Vault.demandEnabled` checks presence first, so every call on a deleted vault refuses `vault_gone`
    (`get`, `hydrate`, `ensureTimely`, `del`, `beginWatch`, the box verbs). `vault.boxListing` refuses
    `vault_gone` on a deleted vault, so no listing, and no watch, is ever made for a tombstone. `Vault.align`
    aligns the box listing in hand (its watch ends, its boxes unexpose), then drops it (`#boxListing = null`).
    A new life received into the Vault (R6, not remade) enables it again; `boxListing` makes the new listing,
    and the host or `useVault` begins its watch (answer 2: the host restarts it, as `useVault` already does by
    `vault_tok`).
  * **A listing's list is its present things** (`listing.ts`). `damaged_rows` and `#damagedRows` are gone; a
    damaged row is still told as bad news and still lets the instance at its scope go (`#takeDown`, which
    absorbed the public `delist`, now aligns the instance before remaking the list). Listeners hear only from
    `#remakeSnapshot`, only when the label list changes; the protected `tellListeners` is folded into it.
    Docs say "kept" for the map (present and deleted instances) and "the list" for the snapshot.
  * **The device's snapshot is the bank listing's parent's** (`bank.ts`, `device.ts`). `Bank.isPresent` is
    true only for a live row of the Bank's own life (it replaced `#isLiveOfLife`), so a bank of another life
    leaves the bank listing's list as a tombstone does; the listing tells the device after
    `receiveRecord`'s whole cascade has aligned. The remake left `dismissGatingAtDiscard`; the dismiss itself
    moved from `Bank.adopt` to the end of a new `Bank.align` override, so the gating's detach (which remakes
    the device's snapshot) also comes after the align. The lease revoke stays in `adopt`, before the align.
  * **`goodbye()` never throws** (`listing.ts`): `#unwatch` is nulled first, then the unwatch is called in a
    try; what it throws goes to `device.tellBadNews` (the host's `onBadNews` while enabled, the logger's warn
    once disabled, as `unexpected_error`).
  * **A deleted bank** already followed the rule (disabled, lease dropped, children aligned); it now also
    leaves the bank listing's list. The "stays listed" comments in `bank.ts` and `bank-listing.ts` are reworded.
  * Docs: `notes/deliver-contract.md` L6 and W2, VOCABULARY's *enlist, delist, listed* and *am* rows,
    `notes/design-models.md` (gone, damaged_rows), the core README's vault entry. Changeset written.
* **Tests** (bank-ending.test.ts, new describe "the end of a bank, a vault and a device..."): a device
  listener reads the bank's and a box's snapshots at a tombstone, at a bank of another life, and at a tombstone
  that dismisses an unlock gating (all three fail on the base); live bankDB watches counted through a lock,
  a vault's tombstone (including `vault.boxListing` refusing), its next life, a sweep and a lock on the
  disabled bank, each watch stopped once; a throwing unwatch at a sweep (logger) and at a vault tombstone
  (host's bad news), snapshots aligned. **Changed**, because they asserted the old behaviour:
  * `vault-listing.test.ts`: `expectLandedGone` now expects `isEnabled: false`; "leaves the vault deleted,
    and the bank unlocked" expects `ensureTimely` to refuse `vault_gone`; "leaves the vault as a local delete
    would" expects `vault.boxListing` to refuse; the damaged-row describe: "lets the listed vault go, out of
    the list, and tells of the row as bad news", "lists another vault at the next listing that finds the row
    whole", "tells its listeners when its list changes, and only then" (were about `damaged_rows`).
  * `vault.test.ts`: "resolves for a vault its fetch finds deleted, leaving the refusal to the guards that need
    it present" → "refuses for a vault its fetch finds deleted, which then answers nothing".
  * `vault-boxes.test.ts`: "refuses for a vault deleted elsewhere..." and "drop their whispers exposed at a
    delete here" (they asserted the tombstone's box listing) expect `vault.boxListing` to refuse; four damaged
    tests assert the list and the bad news in place of `damaged_rows`.
  * `proof.test.ts` and `bank-gate.test.ts` ("deletes the vault and its boxes..."): `vault.boxListing` refuses
    after the delete, where they asserted a fresh listing.
* **Decisions taken**
  * **The deleted thing stays in the listing's map**, out of the list. Removing it would lose the tombstone's
    revision (a late live notice older than the tombstone would resurrect the vault), make `ensureVault` put
    over a void shell where a tombstone is stored, and remake the Vault at its next life, against R6.
  * **`vault_gone`, not `disabled`, for a deleted vault**: the override of `demandEnabled` keeps the kind
    every caller saw before, and `tellBadNews` drops `disabled`.
  * **The `boxListing` getter throws** for a deleted vault, as `bank.maingate` does when disabled; React reads it
    only for a vault the vault listing lists.
  * **`Bank.isPresent` overridden**, not a new predicate on Listing: no new members, and it says what a Bank is
    (one life). Set aside: a protected `isInList(thing)` hook on Listing (new machinery); filtering the list by
    `isEnabled` (the list would then depend on when it was last remade, e.g. after a sweep).
* **Deviations**
  * **A deleted box stays enabled.** Its put is how its next life begins (`vault.putBox` and `box.put` go
    through the box kept at the scope), and it holds nothing once deleted (its exposed whisper is dropped at
    adopt). It is out of the list as before. Gates are deleted only with their bank, so they follow it.
* **Discoveries**
  * Before this thread, `vault.beginWatch()` on a deleted vault already refused, and the old box listing's own
    align ended its watch; the leak was only `vault.boxListing.hello()` (and the box verbs) on the listing the
    getter made under the tombstone's `vault_tok`. A disabled box listing's `get` still reaches storage before
    refusing `disabled` (its `demandEnabled` is in delivery); the getter now refuses first.
  * `notes/guarantees.md`: no line of *The guarantees* is falsified (G4's "dropped at a tombstone" holds).
* **For the Coach**
  * A deleted Vault now refuses `get({ ifAbsent: 'nil' })` and `hydrate()` (as `vault_gone`), so a host
    cannot refresh a deleted Vault to discover a new life through it; the bank's watch, `bank.ensureVault` and
    `bank.vaultListing.get` still do. `Storable.hydrate`'s "an absent thing resolves too" no longer holds for a
    Vault.
  * A deleted box stays enabled (Deviations).
