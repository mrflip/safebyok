# Thread 8: vault_record (2026-10-26)

Branch `20261026-vault_record`, PR [#279](https://github.com/mrflip/safebyok/pull/279), stacked on [#278](https://github.com/mrflip/safebyok/pull/278). Justify: green (core 3190 passed / 37 skipped,
convex 350, graphql 339, postgres 322, react 308, indexeddb 165, fastkey 49, demo 227, e2e 107,
root 265). Size: `everything` 62.0 kB, budget 65 → 66 by the rule; `browserOpts` 38 → 37 by the
rule (`--write`). A `notes/security.md` entry (sonnet subagent) records the stored-shape change.

* **Built**:
  * **The vault record** (`src/vault-record.ts`, new, out of types.ts): `VaultRecord` = `{ format,
    applabel, user_id, vaultlabel, vault_tok, registered_at, vault_epoch, gate_epoch, gate }`,
    `gate: GateRecord | null`, `GateRecord = { passphrase, passkey | null }`, strict, one `.refine`
    holding `gate_epoch` 0 exactly when `gate` is null (`Phrases.GateEpochAndGate`, path
    `gate_epoch`). The wayin records, `WayinRecord`, `VaultFormat`, `TombstoneFormat` and
    `isGated` (now narrowing `gate`) moved with it. Shapes, each a value and type pair from the
    same `Validator` call: `VaultSparse` (omit gate), `VaultStamp` (the six stamp fields),
    `VaultTombstone` (scope picked, `format` and `vault_epoch` extended), `GateSparse` (the gate
    extended with each wayin's sparse shape), `PassphraseWayinSparse` (omit wrap, salt, key
    deriver label), `PasskeyWayinSparse` (omit wrap). Format stays `safebyok-vault-v6` (the
    Coach's "no format bumps"); a flat v6 record reads as damaged by strictness.
  * **Folded in**: `VaultProps`, `GatedVaultProps`, `GatelessVaultProps` (a draft is
    `VaultRecord & { gate: null }` written out; adapters' `doEnsureVault` gets
    `& { gate_epoch: 0 }`, what `checkDraft` hands them), `Tombstone`, `Stamp` (→ `VaultSparse`:
    `vault.stamp` returns the record minus its gate, `format` and `registered_at` now among it),
    `Stamped` (written out, `Pick<VaultSparse, 'vault_tok'> & Partial<VaultSparse>`),
    `VaultPropsExpectation` (→ `VaultRecordExpectation`), `LeaseStanding`, `LeaseView`.
  * **Expectations** (vault-db.ts) sliced from `VaultSparse` with `.strip()` (today's expectations
    stripped; a pick of a strict record would not); `VaultDelExpectation` extends
    `VaultRecordExpectation` with a nullable `gate_epoch`; `StoredVaultTok` and `VaultDraft`
    module-local slices. Every `vault_tok` check now uses the `vault_tok` validator (box.ts's
    `StampShape` is a pick of `VaultSparse`; vault.ts's `StampedShape` takes `vault_tok`).
  * **Box, lease, device record**: `BoxStamp` (box.ts: record minus ciphered, plus `vault_tok`);
    `LeaseStamp` and `LeaseSparse` (lease.ts, both `Z.infer` of one validator: lint refuses
    `type A = B`); `DeviceRecord` is `.readonly()`; `deviceRecordOf(scope, device_id, epoch)`
    (device-db.ts, exported) builds one from `CX.vaultScope.parse(scope)`'s names, used at all
    three raise sites; `raisedDeviceRecord` builds its raise with it too.
  * **Phase 9's lines**: `draftOf` (bank.ts) destructures `CX.vaultScope.parse(scope)`; each
    `raiseDeviceRecord` call goes through `deviceRecordOf`. Every DeviceDB call already got a
    parsed scope (`parts.scope`, `this.#scope`).
  * **Inside the vault**: `#vaultRecord`, gate-keyed `#modelled` WeakMap, `frozenVaultRecord`
    freezes the gate; `Gate.of` takes the record, `gate.record` (was `storedFields`) is the
    `GateRecord`; `#putGate` writes `{ ...held, gate_epoch, gate: gate.record }`.
  * **`Wayin.make`**: a failed parse is re-thrown as `damaged_wayin` with the check's own
    `bad_record` as cause (tested: names `device_id`, never a pasted key).
  * **`VaultScope`** is one type: types.ts's `VaultScope` is `CX.vaultScope` (frozen); the Convex
    type test compares `Readonly<Infer<...>>`.
  * **Snapshots** render each stored record twice, output and `io: 'input'`, so strictness shows
    (input alone rendered a sidecar as `{}`). The v6 snapshot was rewritten under the same format.
  * **Adapters**: IndexedDB and local store the record as is. Postgres keeps its table: `VaultRow`
    (columns.ts) lays the gate into the `passphrase`/`passkey` jsonb columns
    (`rowOfVaultRecord`, `vaultRecordOfRow`; a passkey without a passphrase reads as a damaged
    gate, never as novel), so existing Postgres rows still read. GraphQL: `SafebyokGate`,
    `SafebyokGateInput`, `SafebyokVaultRecord(Input)`, `SafebyokVaultRecordExpectationInput`,
    `SafebyokVaultTombstone`; `fields.ts` gains a `gate` kind (selected and rebuilt by its two ways
    in, dropping `__typename`). Convex: validators `Gate`, `VaultRecord`, `NovelVaultRecord`,
    `VaultTombstone`, `VaultRecordExpectation`; `mustBe` unchanged (it reads the record's own
    top-level `user_id`), its tests pass as they were.
  * **Docs**: VOCABULARY's **vault record** row replaces **vaultProps** (and the rows naming the
    props); notes/old_vocabulary.md gains four rows; VAULTDB.md 1.1 prescribes the logical record,
    not the row; README's cast and DeviceDB paragraph; the device record's doc block says a new
    field bumps its format and why.
* **Decisions taken**:
  * Module `src/vault-record.ts`, since every type touched moves to the concern that checks it.
  * Slices come from `VaultSparse`, not `VaultRecord`: Zod 4.6.7 throws on `pick`/`omit`/`partial`
    of an object with a refinement, so the refined record is sliced from its unexported fields.
  * `Box.make` types its stamp `VaultSparse` but checks only the six fields it keeps, as today.
  * The Lease object keeps its `format` private, as its tests require: `class Lease implements
    Omit<LeaseSparse, 'format'>`; `toJSON()` likewise. Thread 11 decides.
  * Verb and wire names kept: `putVaultProps`, `doPutVaultProps`, `vault_props_stored`,
    `Refusals.staleVaultProps`, `Expectations.vaultProps*`, the `vaultProps` field of
    `StoredVault`/`ListedVault` (thread 10's), Convex's and GraphQL's `vaultProps` argument.
* **Deviations**: "vault props" in prose survives outside the files rewritten (VAULTDB.md 33
  lines, the core README, adapter READMEs, many test titles): a sweep is left for a follow-up.
* **Discoveries**: see the `gate_epoch` report in the PR; the snapshot test's comment ("never
  update the snapshot of a format that stands") contradicts the no-format-bumps ruling.
* **For the Coach** (each an open question in the PR, with a recommendation): `gate_epoch` stays
  on the vault only (keep); no format bump vs the snapshot test's comment (keep v6, reword the
  comment); the device-record format wording (a bump does not save an older build's watermark
  either); verbs and wire names keeping "props" (rename with thread 10); the prose sweep (after
  thread 10); `vault.stamp` vs `VaultStamp` (thread 11); the Lease's private `format` (thread 11);
  `Partial<VaultSparse>` refusing a thing with its own `format` (thread 11: omit `format`);
  `doEnsureVault`'s `gate_epoch: 0` (keep); the GraphQL and Convex renames beyond the preplan
  (keep); Convex hosts clear their tables before deploying; at the restack, apply VOCABULARY's
  retirement to #272's text.
