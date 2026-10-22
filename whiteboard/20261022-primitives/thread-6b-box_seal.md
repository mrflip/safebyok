# Thread 6b: box_seal (2026-10-22)

Branch `20261022-box_seal`, PR #PR, stacked on [#254](https://github.com/mrflip/safebyok/pull/254). Justify: green (core 2905 passed, 37 skipped; react 287; convex 316; postgres 311; graphql 323; indexeddb 164; fastkey 49; demo 221; e2e 107; root 265). `pnpm size:budget`: no line moves (everything 43.3 of 47 kB, Vault 35.6 of 39 kB).

**Blocking question for the Coach** (below, *For the Coach*): the binding the thread was cut for
already stands; what the Coach's question points at is the whole `putBox()` carrying forward an
unopened `registered_at`, and closing that changes a ruled path.

* **Built**:
  * `src/box.ts`: a Box's stamp (`applabel`, `user_id`, `vaultlabel`, `vault_tok`, `vault_epoch`,
    `gate_epoch`) is attached with `decorate` (`src/adorn.ts`) before `Object.freeze`, so it is
    non-enumerable: `{ ...box }`, `Object.keys(box)`, `JSON.stringify(box)` and `box.toJSON()`
    show the five visible fields alone (`boxlabel`, `revision_tok`, `sidecar`, `registered_at`,
    `written_at`). `box.vault_tok` and the rest still read, for `vault.demandConsistentWith`.
    `BoxView` narrows to `Omit<BoxSummary, 'damaged' | 'vault_tok'>`.
  * The rule, named in `BoxRecord`'s and `Box.seal`'s doc blocks: "we sign all immutable fields".
  * `lock()`, `putBox()`, `delBox()` doc blocks and the README's `vault.lock()` paragraph (the
    Coach, via the orchestrator): a lock refuses `vault_locked`, writing nothing, at every step
    before the write -- the wait on `getProof`, `VaultDB.getBox`, `box.extractWhisper()`,
    `Box.seal`; only the write itself, once `VaultDB.putBox` / `VaultDB.delBox` is sent, lands or
    refuses as storage decides, a stale `putBox()` refusing `stale_write` as ever. Existing tests
    cover each step (`vault-demand.test.ts`, *a lock landing during a box call*, and the prompt
    test above it); none added.
  * `tests/box.test.ts`: 41 → 42 `it(` cases (82 → 83 run), none retired. The view test now lists
    five fields and checks the stamp's absence from JSON and `inspect`; a new test reads the stamp
    field by field and finds each non-enumerable, non-writable.
  * The changeset (minor): what a host sees of the stamp; stored boxes unchanged.
  * `notes/security.md`, through a sonnet subagent: the rule, the whole put's carry-forward, and
    what a lock stops.
* **Decisions taken**:
  * **The immutable set**, from `BoxRecord` and `#sealAndPutBox`: the vault's scope and
    `vault_tok`, the `boxlabel`, `registered_at` (carried forward by every store), and the
    `format`, `whisper_codec` and `whisper_schema_version` (literals). Mutable per revision:
    `revision_tok`, `sidecar`, `written_at`. All of both are already in the box ctx
    (`lease.ts`, `#boxCtxOf`, by `cipherCtx`): the ctx bytes are unchanged, `ctx-bytes.test.ts`
    untouched, and `box.test.ts`'s *its registered_at altered* already refuses `damaged_box`.
    So no stored-format change: boxes sealed before still open.
  * The stamp's `vault_epoch` and `gate_epoch` are not in the ctx and must not be: they are the
    vault's as it stood at a read, and move without the box being resealed.
  * `decorate` with the six fields picked by name, not the stamp object spread, so nothing more
    than the stamp is ever attached.
* **Deviations**: the gloss asked for a minor changeset saying old boxes read as damaged. None
  do, so the changeset (still minor, for the narrowed `BoxView` and `toJSON`) says they open as
  before.
* **Discoveries**:
  * The thread's premise -- that `registered_at` is not authenticated -- holds only for the
    listing. The ctx binds it on every revision; what is unauthenticated is the listing's copy,
    which the snapshot shows and a whole `putBox()` (sidecar and whisper both given) adopts in
    `#listedBase` without opening anything (thread 6's open matter 2).
  * For thread 8: the ctx builder to reuse is `cipherCtx` (`src/crypto.ts`), as `wayinCtxOf`
    already does; it binds a whole header object, so "sign all immutable fields" there is a
    question of which fields go in the header, not of a new builder.
* **For the Coach**:
  1. **BLOCKING. Close the whole `putBox()`'s carry-forward of `registered_at`?** Answers:
     (a) **keep** -- the whole put reads nothing (audit 7, as ruled); a `registered_at` altered in
     storage is sealed into the new revision on that path alone; the security note says so.
     (b) **open before carrying** -- every `putBox()` reads and opens the box first, as a partial
     put does: one more storage read and decipher per whole put, and a whole put over a stale
     listing no longer refuses `stale_write` (it writes over what it read): a Contract change.
     (c) **carry ciphertext in the listing** -- `VaultDB.getVault`'s listing keeps each box's
     `box_key_wrapped`, and the whole put unwraps it under the lease against the listed fields
     before adopting them: no extra read, but a change to every adapter's listing shape and the
     snapshot's memory of ciphertext. **Rec: (a)**: the worst storage gains is choosing the time a
     box shows as first stored, which the snapshot already shows as storage holds it; (b) breaks
     a ruled contract and (c) is an adapter-wide change for a timestamp.
  2. **The Lease shows its stamp.** `{ ...lease }` and `lease.toJSON()` still show its scope,
     `vault_tok` and `gate_epoch` (they are all its visible fields). **Rec:** leave it; it holds
     nothing else to show.
