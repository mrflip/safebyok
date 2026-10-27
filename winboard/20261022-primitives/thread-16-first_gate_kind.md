# Thread 16: first_gate_kind (2026-10-24)

Branch `20261024-first_gate_kind`, PR [#269](https://github.com/mrflip/safebyok/pull/269), stacked on #252 (main → #265 → #252 → this → #250).
Justify: green (core 3145 passed, 37 skipped); `pnpm size:budget` within budget.

Final review finding 8, the Coach's "y" on its Rec. The first passphrase of a `novel` vault
(`initialize_gate`) could lose the race midway. Another device sets the first gate, and a
refresh here takes it in while this chain checks strength, derives, or seals the first wayins.
The chain's next demand then refused `gate_moved` ('unlock again'), where the README
(`gate_made_elsewhere` row) promises `gate_made_elsewhere` anywhere "between this one's birth of
the vault and its write".

* **Built**:
  - **The demand option.** The vault's demand takes `firstGate`
    (`#demand`, `#demandAfterWait`, `#inconsistencyWith`, `#provingInconsistency` in
    `src/vault.ts`), and so do the inside demands `GatingInside.demand` and `ProvingInside.demand`.
    With it, a gate moved past the thing refuses `gate_made_elsewhere` instead of `gate_moved`.
    Nothing else changes: no new check, no new await, the same demands at the same places.
  - **The callers.** Each demand the chain makes before its gate is written passes it, judged
    from the thing (made on epoch 0):
    - `#strengthUnder`'s demand (`thing.gate_epoch === 0`);
    - the seals' own demand, `demandSelf({ sealing: true })` in both `seal`s and in
      `sealWayins` (`gate_epoch === 0`), and `sealWayins`' demand on the passkey proving;
    - `demandAfterFailedSeal` (`stamp.gate_epoch === 0`);
    - `#putGate`'s first demand (`base_epoch === 0`).
  - **Tests.** Six in `tests/vault/vault-races.test.ts`, *a first unlock that loses the race
    midway*, over `makeRacingWorld`, whose store rings (no `deafVaultDB`). They cover the
    strength check (a weak verdict, so it is never `weak_passphrase`), the derivation, a
    derivation that fails, `sealWayins`, and `sealWayins` beside a passkey. All five refused
    `gate_moved` before the fix: I checked by stashing `src/`. The sixth holds the boundary: once
    its own first gate is stored and the other device then changes the passphrase before the
    lease is granted, the refusal stays `gate_moved`. It fails as `gate_made_elsewhere` if the
    `sealing` restriction is dropped.
  - **Changeset.** `.changeset/20261024-first_gate_kind.md`, patch.
* **Decisions taken**:
  - **Phase, not thing alone.** A thing made on epoch 0 is the first-gate chain's, but its
    grant runs *after* its own gate is stored. There, a gate moved means a change on top of this
    device's first gate, and `gate_moved` is the truth. So the flag is passed only by the demands
    before the write (the seals', not `grantLease`'s or `checkWayin`'s). It is never inferred in
    `#inconsistencyWith`.
  - **Not on the public demand.** A host's `demandConsistentWith({ ...stamp, gate_epoch: 0 })`
    still refuses `gate_moved`, as its `@example` says: the host's stamp cannot tell whose first
    gate it is.
  - **No catch.** The orchestrator's line was "a renamed or retargeted demand". A catch around
    the chain renaming `gate_moved` would also have worked, but it would add a catch and log the
    wrong kind.
* **Deviations**:
  - **`#putGate`'s refused first-gate write.** It used to demand the vault half only
    (`{ vault_tok }`) and leave `gate_made_elsewhere` to `#gateWriteRefusal`. It now demands the
    gate with `firstGate`, which is one mechanism for the whole chain. Same result when a read
    took the winner's gate in, minus resetting `#readAt` (the picture already holds that gate).
    One edge changes: a refused write whose own refusal is not `stale_write` (say
    `storage_unavailable`), while the picture already holds another device's first gate. It now
    refuses `gate_made_elsewhere` where it passed storage's refusal through. That is what the
    picture shows; I judged it the truer kind. Nothing relaxes.
* **Discoveries**:
  - **One window untested.** `#putGate`'s first demand has its window only in the microtask
    between `sealWayins`' return and `putGate`'s call. No test lands a refresh there; the
    `base_epoch === 0` flag covers it by the same rule.
  - **The Contract** (thread 14's tab, exported and grepped): no line is made untrue. The
    `putWayin` and gatings sections already name `gate_made_elsewhere` for "another device set
    the first passphrase first". The demand lines (`demandConsistentWith`) describe the public
    demand, which is unchanged.
* **For the Coach**:
  - **The putGate edge**: is `gate_made_elsewhere` the right kind for a refused first-gate write
    whose refusal is not `stale_write`, when the picture already holds another device's gate?
    Rec: yes. The picture shows the race, and the next hello shows the vault locked as the other
    device made it.
