# Scenarios: vault, vault listing

`src/models/vault.ts` and `vault-listing.ts` (2026-10-30) over the base as `scenarios.md` reads it: the box sprint done, its plan defects corrected. Nothing of the lease, the gate or the ways in. The old vault is `src/vault.ts` and `src/bank.ts`.

## Key

| column  | values |
| ------- | ------ |
| central | `none` never stored · `full` (every vault record is, until the gate) · `gone` (am 'x') · `ouch` (am 'd') · `*` any |
| staged  | `—` none · `draft` rev 0, a `vault_tok` minted by `draftOf` · `edit` next rev · `del` tombstone at next rev |
| when    | `recent` (fresh · stale · h=0) and `storage` (=c · newer · none · other life: another `vault_tok`) |
| outcome | what the vault model does |
| old     | the old vault's goal, in a few words |
| fit     | ✅ the new contract meets the goal · ⚠️ a gap, noted below · ➖ the lease, gate or ways in: left out |
| claude  | ✅ fits the spec's aim · 🤷 defensible · ⚠️ against it |

## The vault's guard strategies, against the box's

| guard               | box (as planned)                   | vault                               | why |
| ------------------- | ---------------------------------- | ----------------------------------- | --- |
| `demandReadyToEdit` | unlocked; gone or damaged reborn   | present                             | no secret in the record; a new life is a new `vault_tok`, so a new instance |
| `demandReadyToSend` | (gone, t4d)                        | present (goes with the base's at t4d) | every vault record is full |
| `demandReadyToDel`  | unlocked; gone or damaged deleted again | not gone (`am` 'x'); damaged may be | `delDamagedVault` was the way out of `damaged_vault`; a deleted life has nothing left |
| `isLocked`          | the world's (`listing.lockState()`) | its own `lockState()`, `'locked'` until the lease | the bank has no lock |

## hydrate, fetch (old `hello`, `refresh`)

| #   | central | staged | when                  | action               | outcome | old | fit | claude |
| --- | ------- | ------ | --------------------- | -------------------- | ------- | --- | --- | ------ |
| H1  | full    | *      | fresh                 | hydrate              | bank `ensureTimely`; no fetch | `hello` within `staleMinutes` re-settles without reading | ✅ | ✅ |
| H2  | full    | *      | stale                 | hydrate              | bank first, one launch | `hello` reads the device record, `getVault`, the lease | ⚠️ G6 (device record); lease ➖ | ✅ |
| H3  | full    | *      | h=0                   | hydrate, fetch       | fetches, or joins one under way | `refresh()`: `staleMinutes: 0`, shares a read | ✅ | ✅ |
| H4  | full    | *      | last fetch failed     | hydrate              | launches on demand | refused read forces the next | ✅ | ✅ |
| H5  | full    | *      | storage newer         | watch notice         | delivered, adopted | a ring refreshes | ✅ | ✅ |
| H6  | full    | *      | storage older         | any delivery         | ignored (`older`) | an older picture is ignored | ✅ | ✅ |
| H7  | full    | *      | storage gone, newer   | hydrate              | central a tombstone; held as one; `present: false`; no refusal (`'nil'`) | `vault_gone`; object gone; bank births anew on ask | ⚠️ G1 | ✅ |
| H8  | full    | *      | storage other life    | any delivery         | newer: adopted, `vault_tok` and all; the instance is now the new life; boxes of the old life stay held | `vault_remade`; object gone | ⚠️ G1 | 🤷 |
| H9  | full    | *      | storage none          | hydrate              | `record_conflict` (same rev, two fates) | `vault_gone` | ⚠️ | 🤷 |
| H10 | full    | *      | storage damaged       | hydrate              | ouchstone; `present: false`; no bad news | `damaged_vault`, told; `delDamagedVault` the way out | ⚠️ G7 | 🤷 |
| H11 | full    | *      | below this device's highest epoch | hydrate  | adopted or ignored as older; nothing knows the highest | `vault_behind`; locks | ⚠️ G6 | 🤷 |
| H12 | *       | *      | any                   | snapshot             | scope, `vault_tok`, revision, times, `present` | `gate`, `boxes`, `damagedBoxes`, `capacity`, `ask_passphrase_at`, `freshness`, `trouble` | ⚠️ G7; gate, ask ➖ | 🤷 |

## create (old `bank.ensureVault`)

| #  | held | storage              | action                                   | outcome | old | fit | claude |
| -- | ---- | -------------------- | ---------------------------------------- | ------- | --- | --- | ------ |
| C1 | —    | none                 | `fetch(scope, {ifAbsent: 'nil'})` → null; `build(dna)`; `send({}, {ifPresent: 'fetch'})` | draft at rev 0 under a new `vault_tok`; `put` expected null; stored, adopted | one `VaultDB.ensureVault` transaction: stores a novel vault where none is | ✅ three calls, one write | ✅ |
| C2 | —    | full                 | the same                                 | `fetch` builds the stored vault; no draft | the stored vault, never absent | ✅ | ✅ |
| C3 | —    | none, then another device's | the same, a race                  | `put` answers the stored vault (`'fetch'`); adopted, its `vault_tok` with it | the stored vault, its `vault_tok` | ✅ | ✅ |
| C4 | —    | full                 | `build(dna)` without a fetch; `send({})` | hydrate adopts the stored vault and its `vault_tok`, draft dropped (P3: `'fail'` throws `stale_write`) | never a second life over a live one | ✅ | ✅ |
| C5 | full | *                    | `build(dna)`                             | a new draft instance replaces the live one; its boxes' world is the old one | the vault the bank holds | ⚠️ G8 | ⚠️ |
| C6 | gone | gone                 | `build(dna)`                             | a new instance, a new life; draft at rev 0, below the tombstone | past a tombstone, a new life, its counter carried on | ✅ new life; ⚠️ G2 counter | ✅ |
| C7 | —    | none                 | `build(dna)` only                        | a draft, never stored; `present: true` | ensureVault stores at once | ✅ by design: storing is `send` | ✅ |
| C8 | —    | *                    | birth with a lease to take up            | — | born unlocked | ➖ | — |

## edit, send

| #  | central   | staged | when             | action        | outcome | old | fit | claude |
| -- | --------- | ------ | ---------------- | ------------- | ------- | --- | --- | ------ |
| E1 | full      | —      | fresh, =c        | edit({})      | stages the next rev; no lock | no such verb: the record changes only through its gate | ➖ | 🤷 G9 |
| E2 | full      | —      | fresh, =c        | send({})      | `put` at the next rev, adopted | — | ➖ | 🤷 G9 |
| E3 | gone/ouch | —      | *                | edit, send    | `absent_vault` | `vault_gone`, `damaged_vault` | ✅ (another kind) | ✅ |
| E4 | full      | edit   | storage newer    | send          | stored adopted, staged dropped; `stale_write` | stale write refused | ✅ | ✅ |
| E5 | full      | —      | lock (stub)      | edit, send    | allowed: the vault's guards take no lock | a gate write proves the passphrase | ➖ | ✅ |

## del (old `vault.del`, `bank.delDamagedVault`)

| #  | central | staged | when      | action | outcome | old | fit | claude |
| -- | ------- | ------ | --------- | ------ | ------- | --- | --- | ------ |
| D1 | full    | —      | fresh, =c | del    | staged tombstone; `store.del` at central's revision; answer → gone | `del_vault` gating, the passphrase's proof; `delVault` expecting `vault_tok` and `gate_epoch`; locks; object gone | ✅ the compare-and-set (the revision names the life); proof, lock ➖ | ⚠️ G5 |
| D2 | gone    | —      | *         | del    | `absent_vault` | `vault_gone` | ✅ | ✅ |
| D3 | ouch    | —      | *         | del    | deletes at the ouchstone's revision, the damaged record's | `delDamagedVault`: no passphrase, storage decides | ✅ | 🤷 adapter must compare a damaged record's revision |
| D4 | none    | draft  | *         | del    | `store.del` with expected null | — | — | 🤷 |
| D5 | full    | —      | *         | del    | the vault's boxes stay held, their world gone | every record of the vault deleted with it | ⚠️ G4 | ⚠️ |
| D6 | full    | —      | *         | del    | nothing raised on this device | the tombstone's epoch raises the device record | ⚠️ G6 | 🤷 |

## the world of its boxes (`Vault implements BoxWorld`)

| #  | event                              | outcome | old | fit | claude |
| -- | ---------------------------------- | ------- | --- | --- | ------ |
| W1 | a box verb's `ensureTimely`        | `vault.hydrate({ maxMillisSinceRefresh: maxWorldMillis })` | every call says hello within `staleMinutes` first | ✅ | ✅ |
| W2 | a box answer's world               | `vault.receive(sparseOf(world))`; bad news dropped, nothing cached, the vault listing not settled | each answer's vault record taken | ⚠️ G3 | 🤷 |
| W3 | a box answer with no world         | `sparseOf` refuses `bad_record`; the box answer with it | — | ⚠️ G3 | 🤷 |
| W4 | `lockState()`                      | `'locked'`: box verbs that need unlocking refuse `vault_locked`; `whisper` reads `LOCKED` | the lease | ➖ | ✅ safe stub |
| W5 | a box record of another `vault_tok` | adopted unchecked, though `world.vault_tok` now says which life is current | `demandConsistentWith` | ⚠️ G1 | ⚠️ |
| W6 | the vault gone, or remade          | its boxes stay held | the vault object gone, every box call refusing `vault_gone` | ⚠️ G4 | ⚠️ |
| W7 | who makes the vault's `BoxListing` | not written: a box store and cache per vault | the vault holds its listing | ⚠️ G4 | — |

## the vault listing (old `Bank`)

| #  | action                        | outcome | old | fit | claude |
| -- | ----------------------------- | ------- | --- | --- | ------ |
| L1 | hello                         | revive vaults from the cache, watch, hydrate all | the bank lists vaults from storage | ✅ | ✅ |
| L2 | notice, vault unknown         | new instance held | relist | ✅ | ✅ |
| L3 | `at(scope)`                   | the instance or null | `bank.vaultOf` | ✅ | ✅ |
| L4 | snapshot                      | sparse forms of present vaults; a damaged or deleted vault is absent | `BankVault` with `lifecycle` `refused` and its `err` | ⚠️ G7 | 🤷 |
| L5 | `closeVault`, `closeVaults`, `reopenVault` | nothing is let go: one instance per scope, kept | let go: object gone, born anew on ask | ⚠️ G10 | 🤷 |
| L6 | `clearCachedVault`            | — | erase the device record and lease | ⚠️ G6, ➖ | — |
| L7 | `delDamagedVault`             | `vault.del()` on an ouch (D3) | the way out of `damaged_vault` | ✅ | ✅ |
| L8 | `demandConsistentWith(thing)` | no counterpart | scope, `vault_tok`, epochs → `vault_gone` / `vault_remade` / `gate_moved` | ⚠️ G1; epochs ➖ | — |

## Gaps

Noted, not filled. Most severe first.

* **G1. A vault's life changes under one instance (H8, W5, L8).** `vault_tok` follows the record in hand, as `registered_at` will (the Coach, 2026-10-30), so the instance is whichever life storage holds. The create race and `build` before `fetch` come out right (C3, C4). What remains:
  * A newer record of another life is adopted silently, where the old vault refused `vault_remade`.
  * The old life's boxes stay held. Each carries the old `vault_tok`, which nothing compares with `world.vault_tok` (`scenarios.md` F7b), and nothing evicts them (G4).
  * A host can watch `vault_tok` in the snapshot. The old `demandConsistentWith` has no counterpart.
* **G2. A new life restarts its revision (C6).** `build(dna)` stamps revision 0. A device holding the tombstone at a higher seq judges the new life older and ignores it. The old tombstone carried `vault_epoch` into the next life. The box's rebirth by `edit` builds on the tombstone's revision, so it does not meet this.
* **G3. `takeWorld` is synchronous; delivery is not (W2, W3).** The vault record a box answer carries reaches `vault.receive` directly: no cache, no bad news, the vault listing unsettled. An answer with no world refuses. Either `takeWorld` becomes async through the vault listing's delivery, or the world slot is optional.
* **G4. The vault and its boxes (D5, W6, W7).** Nothing makes a vault's `BoxListing`, and nothing evicts it when the vault is deleted or remade. The spec's `evict` is unwritten.
* **G5. `del` has no guard but presence (D1).** Today any caller deletes a vault. The old one asked for the passphrase. That is the gate's to bring, and until then `del` is the most dangerous verb in the model.
* **G6. The device record (H2, H11, D6, L6).** The highest `vault_epoch` seen, which caught storage serving an older vault, has no counterpart. Its stated reason is a removed way in coming back (gate), but it also catches any rollback.
* **G7. What the host sees (H10, H12, L4).** The old snapshot's `freshness`, `trouble`, `damagedBoxes` and `capacity`, and the bank's `refused` vault, have no counterpart. Damage reaches nobody (`scenarios.md` F10). `boxes` is the box listing's snapshot, a second store.
* **G8. `build(dna)` over a live vault (C5)** replaces it. For a box that was a pinned loosening; for a vault it orphans the boxes. The same rule serves both: refuse where `at(scope)` holds a present thing.
* **G9. The vault has no payload (E1, E2).** Until the gate, `edit` and `send` only move the revision, and `send({})` of a draft is the create.
* **G10. Letting go (L5).** The model's one-instance-per-scope rule has no counterpart for `closeVault` and sign-out (`closeVaults`). `goodbye` ends the watch and nothing else.

## What the vault says about Storable

* **The guard pairs are the right seam.** The vault's differences are three one-line overrides: no lock, no rebirth, damaged deletable.
* **The form split survives a thing with no payload.** `isFullRecord` returns true and nothing else bends.
* **The world seam fits where it is a verb.** A box's `ensureTimely` is the vault's `hydrate`. It doesn't fit where it is a delivery (G3) or a lock: the base asks the world for the lock, and a vault's lock is its own.
* **`send` with `ifPresent: 'fetch'` is the old `ensureVault`,** given P3's correction.
* **Identity is scope, and the life a prop (G1).** Once `vault_tok` follows the record in hand, a scope holding successive lives is one instance whose `vault_tok` changes. What a change of life does to the vault's boxes is still open.
