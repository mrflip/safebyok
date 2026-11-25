# Thread 18: vault_minder (2026-11-24)

Branch `20261124-vault_minder`, PR #884, stacked on #883 (`20261124-minders_out`). Proved: see the PR body's **Tests:** line.

* **Built**: `SortedVaultDB` is `VaultMinder`, a rename with no behaviour change.
  - **Identifiers**: `SortedVaultDB` -> `VaultMinder`; `sortedVaultDB` -> `vaultMinder` (`world.vaultMinder`, locals, and the
    `VaultTSQ.make` option, which already read `vaultMinder`); `isSortedVaultDB` -> `isVaultMinder`; `demandSortedVaultDB` ->
    `demandVaultMinder`; `SortedVaultDBListener`, `SortedVaultDBOpts`, `SortedVaultDBChecks`, `SortedVaultDBMembernames` and
    `Phrases.SortedVaultDBExpected` the same way. Test titles, helper comments and doc blocks follow.
  - **Files** (`git mv`): `src/storage/sorted-vault-db.ts` -> `src/minding/vault-minder.ts`; `src/shapes/shapes-sorted-vault-db.ts`
    -> `src/shapes/shapes-vault-minder.ts`; `tests/storage/sorted-vault-db.test.ts` -> `tests/minding/vault-minder.test.ts`. No import
    cycle came of leaving `storage/`.
  - **Exports**: before, the class and its shapes (`DelOnceArgs`, `PutOnceArgs`, `ReceivingThing`, `ThingMaker`, the listener and
    opts types, the checks, `isSortedVaultDB`) came from `safebyok/storage`, and so from `safebyok`, which re-exports it whole.
    After, they come from `safebyok` alone, beside `VaultTSQ` (`src/index.ts`); `src/storage.ts` no longer lists them.
  - **Phrase**: `Throwers.boxSoonestBare` -> `thingSoonestBare`, `Phrases.BoxSoonestBare` -> `ThingSoonestBare`, kind `stale_read`
    kept. Text: "This device has heard of a newer revision of the box but has not fetched it yet." -> "... of this record ...". The
    thrower's doc block says "the Thing at `labelpath`". `Vault`'s own use of it (a box) reads fine with "this record".
  - **Prose**: VOCABULARY.md (six rows: vault, minder, watch/notify, listen/tell, ring/bell, parentage/deltas), the name only,
    and "(to be named the VaultMinder)" dropped from two rows; `notes/wontfix.md`. `notes/security.md`, `whiteboard/` and `human/` untouched.

* **Decisions made**:
  - Exported from the front door only, not from `safebyok/storage`: it is no adapter's concern, and `VaultTSQ`, its sibling in
    `minding/`, is front-door only. `record-hooks.test.tsx` (react-lean) therefore imports it from `safebyok`.

* **Deviations**:
  - `tests/index.test.ts` listed `VaultMinder` among the names the front door must not export ("exports none of the old minders").
    The old class is gone and the name is now the new one: it is dropped from that list, and the VaultTSQ test, retitled "exports
    the VaultMinder, the VaultTSQ and the vault, which safebyok/core leaves out", asserts the front door has it and core does not.
  - `TODO.md` and `notes/answer-contract.md` held no old name; nothing to change there.

* **Discoveries**: `Throwers.thingSoonestBare` is shared by `Vault` (a box) and the VaultMinder (any Thing), which is why the
  "box" in its name and phrase was wrong for one of its callers.
