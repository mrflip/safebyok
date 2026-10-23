# Thread 11: docs, the core half (2026-10-23)

Branch `20261023-docs`, stacked on [#262](https://github.com/mrflip/safebyok/pull/262) (thread 9b). Justify: green (core 3121 passed, 37 skipped; every package).

The core and repo-wide docs only; `safebyok-react`'s README and docs are thread 10's. Thread 9c
runs beside this in `packages/safebyok/src/`, so `src/` is touched only in doc blocks.

* **Built**:
  * **The Contract**: a new tab, *Contract, primitives*, in the design doc
    (https://claude.ai/artifact/J8ooBpFq7tyAAPFrxb3qRq, tab id `bf4f3281-e5dd`), placed after the
    old *Contract* tab, which it replaces. Written from the code's doc blocks at #262: every
    public call of `Bank`, `Vault` and the gating, what each does, guarantees, returns and
    refuses; the per-method table of a lock landing mid-call, led by "a lock spares only the
    transactional part"; every kind in `RefusalKindVals` with its family; the kinds retired
    (`created_elsewhere`, `last_wayin`, `too_many_wayins`, `rolled_back`, `vault_closed`) and the
    two specified and not built (`box_moved`, dropped; `vault_not_novel`, which is
    `gate_made_elsewhere`).
  * **The core README**: "proof" retired from the cast (a gating asks, a proving is made), the
    lock's transactional-part line in *Locking*, and the *Errors* example off the removed
    `tryUnlock`.
  * **`askPassphraseAt`'s doc block**: the `Intl` hint (`DateTimeFormat`, `RelativeTimeFormat`).
  * **VOCABULARY.md**: the bank, the Vault object (and gone), cleartext in place of proof,
    gating, gatingkind and requestCleartext, the gate, the stamp, `vault_epoch`, novel,
    freshness, the device record (in place of the device mark), behind (in place of rolled back),
    `cipheredWith` / `decipherWith` / `wrappedWith` / `unwrap` / `extract`, and the `_tok` rule
    reading "changes on every life". `Vault.make` options are `Bank.make` options.
  * **`notes/old_vocabulary.md`**: a row for each name the sprint retired (Proof, Ask, AskWhy,
    ProofAnswer, getProof, carry_on, lease_ending, the device mark, rolled back, vault_closed,
    opening, absent, decryptWhisper, unlock, ensureLease, the old wayin calls and kinds,
    `TH.makeGate`). `unlock_epoch` and `vault_id` were already there, from #243.
  * **`TH.makeGate` is `TH.makeLatch`** (`safebyok/testing`, so a minor changeset), and its
    local `gate`s in the timing helpers are `latch`es; other tests' local `gate` variables are
    left as they are.
  * **STYLE.md**: try pairs and the get/demand/ensure triplet, under *Naming*; its doc-block
    example in today's terms.
  * **TODO.md**: the Coach's entries (the Postgres README recipe test and pointers, an agent skill
    set, capacity on the Vault object, the stamp as VaultDB params and the immutable fields sent
    early, `damaged_lease` and `lock()`, "whisper unchanged", who holds the expiry, `bank.hello`
    checking the device store, the Auth.js trigger, the badge, the format helper, start over
    clearing only this device, asking every time); the lock-timing entry cut to what is left;
    `getProof`'s entry is `requestCleartext`'s; `tryClose`'s entry gone.
  * **VAULTDB.md, CUSTOMIZATION.md, the root README**: `Bank.make` for `Vault.make`, no catch-up
    after a refusal.

* **Checked and left**: `checkPassphrase` stays (React uses it until thread 10; it is not
  retired). The plan's `old_vocabulary` list named it, but it is current.

* **Decisions taken**:
  * **A new tab, not an overwrite.** The old *Contract* tab is the vault before the sprint in
    nearly every section (`Vault.make`, `ensureLease`, `getProof`, `Proof`, `close()`,
    `Lease.grant`), so a rewrite in place is a new tab anyway. Beside it, the Coach can compare
    the two and retire the old one; nothing the Coach wrote or commented on is lost. Test titles
    cite sections by name ("Contract: Bank.make, Does 1"), which the new tab keeps.
