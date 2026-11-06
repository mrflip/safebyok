# Listing responsibilities: calls, names, and who does what

*Orchestrator, 2026-11-06, answering the Coach's question on #523: "that should fetch vaults, but not try to get every
vault complete with every box ... I had vaultDB calls to list vaults (returning `{ vaults }`) and boxes (returning
`{ boxes }` and maybe some vault props spread on it, but world is where the vault is updated from). Could I ask you
(orchestrator) to reflect on the class relationships and recommend what calls, function names, and responsibilities each
of the facilities involved should be?" Facts gathered by a read-only opus agent against main at 374098121 and #523's
branch; line numbers hold for either.*

## Where we are

The bank side is already as the Coach remembers: `getBank` answers `{ vaults, damaged_records }` with no boxes
(`storage/vault-db-new.ts:89`). The vault side is not. `getVault` answers the vault row with its boxes spread onto it
(`VaultListed`, :33, :121; `doGetVault` reads the row and every box row in one step, :347). `VaultListing.fetchListed`
(`models/vault-listing.ts:89`) strips the boxes off the row and hands them on, so the vault listing is carrying the box
listing's answer; on #523 `BoxListing._takeListed` takes them in. Every vault refresh (`Storable.fetch`/`hydrate` →
`VaultListing.tryGetRow`, :190 → `getVault`) reads every box row and throws them away. Each box row arriving in a vault's
hello is parsed three times: by the vaultDB (`listedBoxesOf`, `vault-db-new.ts:395`), by `VX.boxesListed.parse`
(`vault-listing.ts:95`), and by `sparseOf` in `Listing.buildOrReceive` (`listing.ts:235`).

A box answer's `world` is already the vault row, checked live in that life (`checkedVaultLife`, `vault-db-new.ts:133`);
`Listing.deliver` hands it to `Vault.takeWorld` (`listing.ts:199`; `vault.ts:288`), which parses it and receives it when
the `vault_tok` matches. So "world is where the vault is updated from" holds for box answers today; it is the hello path
that bypasses it.

Nothing was beaten back in code: the old core also returned vault and boxes in one read (`safebyok-old/src/vault-db.ts:233`),
and `listBoxes` was folded into `getVault` (`notes/old_vocabulary.md:143`). The split the Coach remembers never landed.

## Options

- **A. The vault row carries its boxes, as today.** Rename `_takeListed` and stop. Gives up: refreshes keep reading every
  box; the vault listing keeps handling box answers; the hello path keeps bypassing `takeWorld`.
- **B. A `listBoxes` verb; `getVault` answers the row alone.** `listBoxes({ ...vaultScope, vault_tok })` answers
  `{ boxes, damaged_records }` with the vault row as `world`, read in the same step (as `getBox` already does).
  Underneath, `doListBoxes` is today's `doGetVault` keyed by `vault_tok`; `doGetVault` becomes the row alone; the row
  plus its boxes is still one atomic read. Gives up: a rebirth first seen at a vault's hello arrives as `vault_mismatch`
  rather than as a replaced vault, unless `takeWorld` forwards an other-life row to the vault listing (below). Adapters
  gain one `do*` hook; every in-tree adapter but `MemoryVaultDB` is still on safebyok-old, so this is the cheapest moment.
- **C. B, with `vault.hello` refreshing the vault before it lists.** The vault listing's `fateOver` then handles a rebirth.
  Gives up a second round trip on every hello.
- Sub-choice under B: whether `listBoxes` also spreads vault props onto its `val`. Not: `world` already carries the row,
  and two copies invite two update paths.

## The Coach's ruling (2026-11-06)

"Go ahead Recommendation B", with: "No, please" on the other-life forward below; "The 'that needs care' is because of the
monstrous complexity of fateOver, which is overpromising and tripping on its own feet. So don't take too much care
please. The crossing here is microscopic in practice, and the thinking pattern described here has led to catastrophe
before. A world with a different vault tok should never reach BoxListing, because it is embedded in every request."
And, on `takeWorld`: "should this method be on boxListing; would that help with the other life problem?" Answered: no;
`takeWorld` stays on Vault, parses and receives the row, and its `vault_tok` branch goes: the vaultDB refuses a mismatched
tok on every box verb, and, the Coach: "If it did reach BoxListing, it would be after BoxListing had been disabled and the
vault it's attached to removed." Also: "There is no respect in which it's acceptable for any part of the code to get more
complex while performing this refactor, so please halt if it appears so."
 The rebirth paragraph below is struck accordingly; thread 15 builds the rest.

## Recommendation: B

It is the Coach's model ("world is as listing has it: bank for vaults, vault for boxes"), removes a parse and a hand-off,
makes a refresh cost one row, and lets `takeWorld` be the one place a vault is updated from an answer. ~~The rebirth case is handled in the same thread: `BoxListing.deliver` checks the world's life and a row of another life
goes to the vault listing's `fateOver`.~~ Struck by the Coach ("No, please"): a world of another life never reaches the
box listing, because `listBoxes` carries the `vault_tok` and the vaultDB answers `vault_mismatch`.

## Responsibilities and calls under B

- **vaultDB** is the boundary and does the one parse of every row it hands up. `listVaults(bankScope)` (renamed from
  `getBank`) answers `{ vaults, damaged_records }` with the bank scope as `world`; `getVault(scope)` answers the row
  alone; `listBoxes(vaultScope + vault_tok)` answers `{ boxes, damaged_records }` with the vault row as `world`; `getBox`,
  `putBox`, `delBox` unchanged, each with the vault row as `world`.
- **Bank.** `hello` loads the libraries, calls `vaultListing.list()`, caches the device record, then `vaultListing.hello()`
  (the watch).
- **VaultListing.** `list()` (renamed from `fetchBank`) calls `listVaults` and builds each vault; `fetch`/`tryGetRow` calls
  `getVault`. `fetchListed`, `vaultRowOf` and `NothingListed` go (`vault-listing.ts:88-96, 203-210`). `boxListingOf` stays.
- **Vault.** `hello()` calls `boxListing.hello()` (the watch first, so no notice falls between) then `boxListing.list()`.
  A refresh stays `fetch`/`hydrate`/`ensureTimely` → `getVault`. `takeWorld` remains the one place a box answer updates
  the vault; it parses and receives; its `vault_tok` branch goes (no forward, no thrower).
- **BoxListing.** `list()` calls `listBoxes`; `deliver` hands `world` to `vault.takeWorld` before any box is built, sets
  `damaged_records` aside, vacates held boxes now damaged, builds each sparse box. `hello()` is the base class's watch.
  `get`, `fetch`, `put`, `del`, `create`, `puttable` unchanged. `_takeListed` goes.
- **Box.** Unchanged; its answers' `world` reaches the vault through its listing.
- **Parsing.** The vaultDB's `listedBoxesOf` is the one parse. `VX.boxesListed` goes, safe once thread 8 brands the
  VaultDB (answers come from our own base class). The per-box `sparseOf` in `buildOrReceive` stays as the general path's.

## What changes, what stays, what it costs

- `vault-db-new.ts`: `VaultListed` becomes `BoxesListed = { boxes, damaged_records }`; `getVault` drops `listedBoxesOf`;
  `listBoxes`/`tryListBoxes`/`doListBoxes` added; `getBank` renamed `listVaults`. `memory-vault-db.ts:92-97` splits into
  `doGetVault` and `doListBoxes`. `box-listing.ts`: `list()` replaces `_takeListed`. `vault.ts:300-305` and `bank.ts:143`
  as above. `VOCABULARY.md`'s `getVault` row ("the vault record and the box listing in one read") rewritten.
- Stays: `Listing.deliver`/`buildOrReceive`, `fateOver`, the box verbs, the watch, `models-world.ts` (scripts box verbs
  only; `willList` only if a test needs it).
- Tests: `storage/vault-db-new.test.ts:72-92` (box assertions move to `listBoxes` cases; :179 follows the rename);
  `models/vault-boxes.test.ts:13-35, 67-69` and #523's moved test spy on `tryListBoxes`; `halpimonfire.test.ts:64-65`;
  `vault-world.ts:240`; `timing.ts:157` (a doc example); `bank.test.ts:97, 109` for the rename. `vault.test.ts:124` stays.
- Changeset minor: a vaultDB verb added, one renamed, `getVault`'s answer narrowed.

## Where it goes in the sprint

A thread of its own, **15 `list_boxes`**, stacked after thread 7 (threads 6 and 7 rewrite the listing constructors and
Bank's constructor in the same files; 6 must keep `takeWorld` on the `BoxWorld` Pick). Thread 8 then drops `boxesListed`
from its list, the brand being what lets the second parse go. #523 stands as filed (`hello()` taking nothing); its
`_takeListed` is replaced by `list()`, not renamed, so the naming row closes with this. If the Coach would rather have it
sooner, it can be cut from main now, ahead of 6, at the cost of a restack conflict in `box-listing.ts` later.
