# Thread 15: list_boxes (2026-11-06)

Branch `20261106-list_boxes`, PR #530, stacked on #523 (cut from its tip, `e05c25d7d`). Justify: green; safebyok
1851 tests in 61 files, 0 lint errors.

The design is the Coach's Recommendation B in the sprint's `listing-responsibilities.md`.

* **Built**:
  * **vaultDB** (`storage/vault-db-new.ts`):
    * `listBoxes({ ...vaultScope, vault_tok })` and `tryListBoxes` answer `{ boxes, damaged_records }` (`BoxesListed`)
      with the vault row as `world`, checked by `checkedVaultLife`, so a stale tok answers `vault_mismatch`.
    * `doListBoxes(query)` answers `{ vault, boxes }` (`BoxesFetched`), read in one step.
    * `getVault` and `doGetVault` answer the row alone; `#moveGate` reads through the narrowed `doGetVault`.
    * `getBank`, `tryGetBank` and `doGetBank` are renamed `listVaults`, `tryListVaults` and `doListVaults`.
    * `SX.vaultQuery` / `VaultQuery` (vault scope plus `vault_tok`) is `listBoxes`'s input.
  * **MemoryVaultDB**: `doGetVault` and `doListBoxes` split from the old `doGetVault`; the `rowPeek` there is gone.
  * **BoxListing.list()** calls `tryListBoxes`, hands `world` to `takeWorld` before it builds a box, sets damaged rows
    aside and vacates the held boxes now damaged. `_takeListed` and its eslint-disable are gone.
  * **Vault**: `hello()` calls `boxListing.hello()` and then `boxListing.list()`. `takeWorld` is
    `this.receive(VX.vaultRow.parse(world))`, with its `vault_tok` branch gone.
  * **VaultListing**: `list()` replaces `fetchBank`. `fetchListed`, `vaultRowOf` and `NothingListed` are gone, and
    `tryGetRow` calls `tryGetVault` directly. **Bank** calls `vaultListing.list()`.
  * `VX.boxesListed` is gone, and `tryListBoxes` joins the vaultDB duck.
  * `VOCABULARY.md`'s vaultDB row names `listVaults`, `getVault` (the record alone) and `listBoxes`, in a commit of its
    own.
  * The changeset (minor) is `.changeset/20261106-list_boxes.md`.
* **Decisions taken**:
  * **A `vault_mismatch` refusal carries `world: null`**, with the stored row still in `dbhas`
    (`Refuse.vaultMismatch`). Once `takeWorld`'s tok branch was gone, the other life's row reached `receive` and threw
    `otherVaultTok`. This follows `BadAnswer`'s doc ("null when the refusal holds no aligned row") and the Coach's "a
    world with a different vault tok should never reach BoxListing". The vault listing's dbhas path still replaces the
    slot on a rebirth. It changes `getBox`'s test (world was `vault`).
  * **No `ensureTimelyWorld` in `BoxListing.list()`.** The answer carries the world, and a refresh first would be
    Option C, which was rejected.
  * **`BankListed` kept its name** to keep the diff tight; `VaultsListed` would match `BoxesListed`. This is an open
    matter.
  * **`vaultQuery` is a new checker (+2 lines)**, not a reuse of the deviceDB's `leaseQuery`, which has the same
    fields but a misleading name.
* **Deviations**:
  * **Removed #523's test "refuses a vault.hello whose listed boxes fail their check".** The model's parse it tested is
    gone; the vaultDB's `listedBoxesOf` is the one parse, and the `makeWorldWithRubble` tests cover damaged rows.
  * **The vault_gone hello test** (`vault-boxes.test.ts`) now checks `isPresent` false and an empty listing. It used to
    check `getBox` refusing `vault_gone`: that call now answers `disabled`, because the tombstone world received during
    hello vacates the box listing hello built, and the `boxListing` getter hands back the vacated one. A box verb's
    `vault_gone` already ended that way; hello now reaches it too. This is an open matter, not fixed here (no growth).
* **Fate and deliver, per method** (the Coach's ground rule: in these methods, deletions and renames only):
  * `Vault.takeWorld`: the `const row` line and the `vault_tok` branch are deleted. What is left is the existing
    `receive` of the parsed row, on one line.
  * `Listing.deliver`, `BoxListing.deliver` (there is none), `buildOrReceive`, `fateOver`, `handleIfAbsent` and
    `Storable.reconcileCentral`: untouched. `listing.ts` and `storable.ts` are not in the diff.
  * `BoxListing.list()` is a new method, not one of these. It replaces `_takeListed` and the call
    `VaultListing.fetchListed` made. It holds two branches: `answer.world !== null` (a refusal such as
    `storage_unavailable` carries no world) and `! answer.ok`, the same refusal tail as `VaultListing.list()`. It does
    not call `deliver`, because `deliver` builds one record and `listBoxes` answers a list.
* **Net lines per file** (`git diff --numstat e05c25d7d`):

  | File | + | - | net |
  | --- | --- | --- | --- |
  | src/storage/vault-db-new.ts | 36 | 23 | +13 (the `listBoxes` verb, its hook and type: the move of `getVault`'s box half) |
  | src/models/box-listing.ts | 14 | 7 | +7 (`list()` makes the call `fetchListed` made: a move from vault-listing) |
  | src/models/vault-listing.ts | 6 | 28 | -22 |
  | src/shapes/shapes-vaultish.ts | 2 | 11 | -9 |
  | src/models/vault.ts | 2 | 6 | -4 |
  | src/shapes/shapes-storage.ts | 5 | 3 | +2 (`vaultQuery`) |
  | src/storage/memory-vault-db.ts, src/refusals/throwers.ts, src/helpers/phrases.ts, src/models/bank.ts | | | 0 each |
  | **src total** | 78 | 91 | **-13** |
  | tests/storage/vault-db-new.test.ts | 53 | 40 | +13 (three box tests moved under `listBoxes`, plus its `vault_mismatch` case) |
  | tests/models/vault-boxes.test.ts | 11 | 20 | -9 |
  | bank.test, halpimonfire.test, bank-world, vault-world | | | 0 each |
  | VOCABULARY.md | 1 | 1 | 0 |

* **Discoveries**:
  * **#511** (`damaged_records` becoming `damaged_rows`) conflicts here in `vault-db-new.ts` (`BankListed`/`BoxesListed`,
    `listVaults`, `getVault`, `listedBoxesOf`), `box-listing.ts` (`#damagedRecords`, `list()`), `vault-listing.ts`
    (the removed trailing section), `shapes-vaultish.ts` (the removed `boxesListed`), `vault-db-new.test.ts` and
    VOCABULARY.md. Each resolves the same way: take this side, then rename `damaged_records` to `damaged_rows` in it.
  * `tests/test-helpers/timing.ts`'s example `holdNextCall(vaultDB, 'tryGetVault')` during an unlock still holds (a
    refresh still calls `getVault`), so it stays. So does `vault.test.ts`'s `gets` spy.
  * `RefusingVaultDB` (bank-world) needs no `doListBoxes` override: no test refuses `vault.hello` through it.

* **After review**:
  * The Coach asked, on `Vault.takeWorld` having lost its `vault_tok` branch, for a consistency guard "to assuage
    agents". `Storable.receive` already holds it: `reconcileCentral` throws `otherVaultTok()` when `rcvd.vault_tok`
    differs from the vault's, before any age or shape is judged. So no second guard went in; one `//` line above
    `takeWorld`'s call to `receive` says so.
