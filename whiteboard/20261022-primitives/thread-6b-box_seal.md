# Thread 6b: box_seal (2026-10-22)

Branch `20261022-box_seal`, PR [#256](https://github.com/mrflip/safebyok/pull/256), stacked on [#254](https://github.com/mrflip/safebyok/pull/254). Justify: green (core 2911 passed, 37 skipped; react 287; convex 316; postgres 311; graphql 323; indexeddb 164; fastkey 49; demo 221; e2e 107; root 265). `pnpm size:budget`: no line moves (everything 43.4 of 47 kB, Vault 35.6 of 39 kB).

* **Built**:
  * `src/box.ts`: a Box's stamp (`applabel`, `user_id`, `vaultlabel`, `vault_tok`, `vault_epoch`,
    `gate_epoch`) is attached with `decorate` (`src/adorn.ts`) before `Object.freeze`, so it is
    non-enumerable: `{ ...box }`, `JSON.stringify(box)` and `box.toJSON()` show the five visible
    fields alone. `box.vault_tok` and the rest still read, for `vault.demandConsistentWith`.
    `BoxView` is `Omit<BoxSummary, 'damaged' | 'vault_tok'>`.
  * The rule, named in `BoxRecord`'s and `Box.seal`'s doc blocks and the security note: "we sign
    all immutable fields".
  * **Rework (the Coach's rulings, 2026-10-22):**
    * **The lease is private again.** `vault.lease` is gone. `src/held-lease.ts` holds a
      module-private `WeakMap`: the Vault constructor calls `registerLeaseReader(this, () =>
      this.#lease)` (first registration wins), and `Box.seal`, `box.extractWhisper()` and a
      damaged lease's `#dropDamaged` read it with `heldLeaseOf(vault)`. Exported from no entry
      point. `BoxVault` and `LeaseVault` no longer name `lease`; `TH.leasedSliceOf` registers its
      slice. The surface walk (`vault-boxes.test.ts`) now finds no `Lease` at all.
    * **The delegated block**, `// == [Vault: the lease, delegated]`: `askPassphraseAt` (the
      lease's deadline, already on the snapshot, moved here from the fields section, its doc
      block now for an autolock line) and `leaseMillis`. Nothing new: the lease's other fields
      (scope, `vault_tok`, `gate_epoch`) already read on the Vault object as the vault props'
      own, equal to the lease's while it stands.
    * **`getWhisper` of none refuses `absent_box`** (`Promise<Whisper>`); `getBox` still resolves
      null; `useWhisper` drops its own null check. Thread 6's changeset and details line amended
      in place on this branch, so the CHANGELOG does not say both.
    * **Lock wording.** `lock()`, `putBox()`, the README: a `putBox()` refuses `vault_locked`
      while it waits on `getProof`, `VaultDB.getBox` / `box.extractWhisper()`, or `Box.seal`; a
      `delBox()` while it waits on `getProof`. Once `VaultDB.putBox` / `VaultDB.delBox` is sent,
      storage decides. New tests: a lock on the `getProof` prompt of a `putBox()` and a `delBox()`.
    * **Renames**: `#takeStoredBox` → `#updateBoxListingOf`; its twin `#takeBoxDeletion` →
      `#dropBoxListingOf`. Threads 5's and 6's files note the new names beside the old.
  * Tests (`it(` cases; none retired): `box.test.ts` 41 → 42; `held-lease.test.ts` 0 → 3;
    `vault-boxes.test.ts` 126 → 127; `vault-demand.test.ts` 33 → 34 (two runs).
  * `notes/security.md` (sonnet subagent), amended in place: the box ctx entry, thread 6's
    whole-put and `vault.lease` entries, the non-extractable-vaultKey entry, thread 5's `lock()`
    entry ("at each wait named here") and its ground-truth entry (the stamp).
* **Decisions taken**:
  * **The immutable set**: the vault's scope and `vault_tok`, `boxlabel`, `registered_at`, and
    `format` / `whisper_codec` / `whisper_schema_version`. Per revision: `revision_tok`,
    `sidecar`, `written_at`. All already in the box ctx (`lease.ts`, `#boxCtxOf`): ctx bytes
    unchanged, no stored-format change.
  * The stamp's epochs stay out of the ctx: they move without the box being resealed.
  * **A WeakMap, not a static-block accessor** (as `leaseRecordOf` is): a `#lease` brand check
    would refuse the test slices `Box` and `Lease` are tested with; a registry lets the slice
    register as a Vault does, and keeps nothing reachable from the Vault object.
* **Deviations**: no box reads as damaged (the gloss expected so); the changeset says they open
  as before.
* **Discoveries**:
  * `registered_at` was already authenticated; only the listing's copy is not, which a whole
    `putBox()` carries forward (ruled: keep).
  * **Two copies of the package** each hold their own registry: a Box of one copy refuses
    `vault_locked` under a Vault object of the other. `box.test.ts`'s other-copy test registers
    its slice with the second copy.
  * For thread 8: reuse `cipherCtx`, as `wayinCtxOf` already does.
* **For the Coach**:
  1. **Ruled (a), keep**: the whole `putBox()` carries the listing's `registered_at` unopened.
  2. **Cross-copy Vault and Box** refuse `vault_locked`, a misleading kind for "another copy".
     **Rec:** leave it; `Box.make` already refuses another copy's Box as no box (`bad_record`).
