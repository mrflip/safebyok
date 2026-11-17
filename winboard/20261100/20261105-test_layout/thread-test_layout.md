# Thread test_layout: tests parallel the files they test (2026-11-05)

Branch `20261105-test_layout`, no PR yet (the orchestrator files it), stacked on `20261105-fold_blocks` (`3317d7ca`).
Justify: green (`pnpm justify` exit 0). Names proof: 1766 tests before and after, the sorted list of full test names identical,
0 failures.

* **Built**: every test file under `tests/models/` and `tests/storage/` that passed about 600 lines is split along its source's
  fold groups, flat as `<source>-<foldgroup>.test.ts`. A move and nothing else: no title, assertion or logic changed.

  | Source | Test files (lines) |
  |---|---|
  | `storable.ts` | storable 382, storable-ops 456, storable-receiving 248 |
  | `box.ts` | box 421, box-whisper 221, box-putting 241 (box-seal 55, left) |
  | `box-listing.ts` | box-listing 271, box-listing-create 339, box-listing-rows 273 |
  | `listing.ts` | listing 247, listing-verbs 283, listing-delivering 298 |
  | `vault-db-new.ts` | vault-db-new 203, -puts 282, -dels 172 |
  | `vault.ts`, boxes | vault-boxes 318, vault-boxes-putting 322 |
  | `vault.ts`, unlocking and lease | vault-unlock 323, vault-lease 306 |
  | `bank.ts` | bank 268, bank-ending 394 |

  Unsplit and untouched in size: proving 495, gating 477, lease 441, vault-gate 379, vault-listing 384, vault-life 207,
  vault 184, wayin 119, gate 112, device-db-new 240, proof 474, halpimonfire 194, `loosened/`.
  `helpers/` and `refusals/` already pair one to one with `src/` and are untouched.
* **Shared helpers**: `tests/test-helpers/storage-world.ts` is new (scope and tombstone builders of the vault-db tests);
  `vault-world.ts` gained `boxlabel`, `Whisper`, `Sidecar`, `makeWorld`, `makeWorldWithBox`, `nextUnlisted`,
  `makeWorldWithRubble` (the vault-boxes builders); `bank-world.ts` gained `OtherBag` and `labelsOf`. Names unchanged.
* **Decisions taken**:
  * A wrapping `describe` is duplicated into each piece (`MemoryVaultDB`, `BoxListing`, `Listing's pipeline`), so every
    full test name keeps its ancestors; each piece passes alone.
  * A helper that reads `held` (the per-file hook binding) cannot be shared, so each piece keeps a small local adapter
    (`builtOf` in the three box files, `dna` in box-listing) and each pipeline piece of listing keeps its own helpers
    under one banner. This duplicates a few lines; the alternative was changing helper signatures.
  * `vault-slot.test.ts` is renamed `vault-listing.test.ts` (it tests `VaultListing`); its own commit.
  * `vault.test.ts` and `gate.test.ts`: one describe each moved so the order follows the source's fold groups.
  * `notes/guarantees.md` line 331 now names `vault-lease.test.ts`, where the lease-friend test sits.
* **Deviations**:
  * Over 500: none that this thread made; proving 495 and gating 477 stay under. `vault-db-new-dels` 172 and box-seal 55
    are the small ones: dels is a clean fold group, box-seal is the real-cryptography box test and stays beside box.
  * `proving.test.ts` and `gating.test.ts` do not follow their sources' group order (proving runs buildNovel/buildStored
    before buildWayin/buildLease; gating runs by scenario). Left: moving 100-line describes there risked their shared
    consts, and the order reads as a progression.
  * `makeWorld` is a vague name for a vault-world export (a born vault with its boxrows and spies); kept, as a helper's
    name does not change in this thread.
  * No `eslint-disable` or `ts-expect-error` added.
* **Discoveries**: the world files are imported directly (`../test-helpers/vault-world`), not through the door
  `tests/test-helpers.ts`, which is also published as `safebyok/testing`; I kept to that. `useModelsWorld().mw` is a getter
  bound per test file, which is the whole reason a `held`-reading helper cannot move.
* **For the Coach**:
  * The sprint folder name: no `whiteboard/20261105-*` existed, so this file sits in `whiteboard/20261105-test_layout/`.
  * Whether `vault-lease.test.ts` (the vault's lease group) is clear beside `lease.test.ts` (the Lease class).

**Open matters**: `makeWorld` rename; `proving`/`gating` describe order; `vault-lease` naming.
