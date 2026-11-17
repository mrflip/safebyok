# Thread 12: The snapshot (2026-10-26)

Branch `20261026-snapshot`, PR #283, stacked on #282. Justify: green (safebyok 3274 passed / 37
skipped; safebyok-react 308; demo 229 / 17 skipped; convex 350; graphql 344; postgres 322;
indexeddb 165; fastkey 49; e2e 107; root 265; size check green).

* **Built**:
  * `VaultSnapshot` (src/vault.ts) is the preplan's shape: scope, `format`, `vault_tok`, `gate`
    (`GateSparse | null`), `boxes`, `damagedBoxes`, `capacity`, `ask_passphrase_at`, `freshness`,
    `trouble`. `state`, `passphrase`, `passkey`, `registered_at`, `gate_epoch` and the
    `VaultState` type are gone.
  * Slices keep identity: `#picture(shown, now)` passes each of `gate`, `boxes`, `damagedBoxes`,
    `capacity` through `keptIfSame` (stableJsonify-equal → the old object). `#capacity()` returns
    a frozen value. `gateSparseOf(gate)` (src/vault-record.ts, beside `vaultSparseOf`; not
    exported by any entry) builds the frozen sparse gate.
  * `Box.seal` takes scope and `vault_tok` from `vault`; `madeUnder` narrowed to the epochs
    (stripped, so a `VaultSparse` still passes). Provings' `vault` is `import type { Vault }`.
  * safebyok-react: `askPasskey(gate: GateSparse | null)`; the passkey button, passphrase modal
    and gating modals read `snapshot.gate?.passkey`. README bullets on `useVaultSnapshot`.
  * Demo: `WaysIn` and `LockChip` read the gate and `ask_passphrase_at`; `ApiKeySlot` says
    "update the app" for a `newer_format` key; the dashboard lists sound and damaged boxes
    together in boxlabel order. Tests for both.
  * Tests: `TH.stateOf(snapshot)` (builders.ts, exported through `safebyok/testing`) reads
    novel/locked/unlocked from the two fields; ~300 test reads moved to it, `gate_epoch` reads to
    `TH.madeUnderOf(vault)`, wayin reads to `snapshot.gate?.<slot>`. New suite in
    vault-make.test.ts, "the vault's snapshot, slice by slice", pins the shape, the duck typing,
    the screen choice and slice identity across a hello, a lock, a putBox and a new way in.
  * Docs: the core README gains *The snapshot* (under Quickstart) and its ways-in and passkey
    sections read the gate; VOCABULARY's wayin and novel rows; STYLE.md line 87 (now
    `vault.snapshot.gate`); notes/security.md amends thread 11's entry, parts (2) and (7).
  * `.size-limit.json`: `Bank` 58 → 59 kB (55.068 kB, up 0.09 kB; the rule moved the line).
* **Decisions taken**:
  * Slice identity by JSON equality in one place (`#picture`), not by tracking each writer: every
    read makes new arrays, and this keeps them whenever nothing changed.
  * `WayinSummary` (sparse + `vault_tok`) stays for `Wayin.toJSON()` and a `damaged_wayin`'s
    `meta.wayin_listed`; its doc blocks now say so. The snapshot shows the sparse shape alone.
  * `TH.stateOf` rather than spelling both fields out in ~300 assertions: a test helper, not a
    snapshot field, so NEWSTYLE §5's "no derived field" holds.
  * `Box.make` keeps taking the scope and `vault_tok` from `madeUnder`: a test pins that a box
    keeps the `vault_tok` its read expected. Only `Box.seal` was named.
* **Deviations**: none from the plan. The React stub vault (`TH.stubVault`) keeps a
  `state: 'novel' | 'locked'` option, as a test shorthand, building the gate from it.
* **Discoveries**:
  * `#takePicture` replaced `#boxes` and `#damagedBoxes` with new frozen arrays on every read, so
    thread 10's "replaced only when a box changes" held only for this device's own writes; the
    snapshot now keeps them by content.
  * STYLE.md's line said `vault.putWayin()` resolves the way in; it resolves the vault. The line
    now says the vault's `snapshot.gate` then shows the way in.
  * For thread 13: `keptIfSame` (vault.ts, *Vocabulary*) is what a sorted frozen
    `bank.snapshot.vaults` can reuse for its own identity.
* **For the Coach**:
  * `Box.seal`'s public signature narrowed (YOLO, in the changeset).
  * `askPasskey` takes the gate (the preplan's ruling), a break for any host calling it.
  * The demo's damaged-and-sound box order (YOLO).
