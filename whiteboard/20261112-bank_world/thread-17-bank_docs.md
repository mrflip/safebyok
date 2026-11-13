# Thread 17: bank_docs (2026-11-13)

Branch `20261112-bank_docs`, PR #688, stacked on #686. Docs only: no `src` or test touched. Justify green:
scripts 285, core 2964, indexeddb 197, postgres 213, react 262, fastkey 43, convex 304, demo 99,
graphql 409, e2e 549.

* **Built**:
  * STYLE.md: a Chute line is the one exception to #purpose-not-machinery.
  * notes/security.md: six 2026-11-13 entries, written by sonnet subagents. The bank has one gate, its lease and
    autolock are the bank's, and deleting a vault removes no key.
  * READMEs: the core, fastkey, indexeddb, react, postgres, root (*The shape of it*) and demo READMEs.
  * SECURITY.md: *Two properties a reviewer should not have to find*. One unlock opens every vault, and only
    `bank.delPrompt()` removes a wrapped key.
  * VOCABULARY.md: brought to the bank. Covers the lease, the Vault object across lives, and *wayin, as stored*
    with its ctx binding.
  * The sprint's changesets (20261112-*): corrected, and made to read as one release note.
  * notes/design-models.md and design-proof.md: rewritten to the code (opus subagent). The vault gatings became
    `build_bank`/`unlock_bank`. Added a Gate listing section and a `del_bank` section. `vault.del` needs the bank
    unlocked and asks nobody. The repeated-delete table follows the classifier.
  * notes/gallant*.md: facts only, every example kept whole. Changes include `bank_locked`, `Device.make`,
    `device.ensureBank`, `wayinlabel` and `bank.maingate`.
  * notes/old_vocabulary.md: gains the names this sprint retired.
  * TODO.md: each gate-per-vault and lease-per-vault entry judged again; see below. Also the Coach's
    2026-11-13 side quest on the GraphQL client's `__typename` drop maps.
* **TODO.md, judged**:
  * Removed:
    * *A wayin change racing this handle's own refresh*. Its machinery (`reviseWayins`, `outlived`, `grantLease`)
      is gone, and what is left of the race is the 8c entry beside it.
    * *`del()`'s edge cases*. `vault.del` hydrates first, and given the record it refuses `stale_write` over any
      other revision.
    * *Whether `damaged_lease` calls `lock()`*. It does (`Lease.#bankKey`).
    * *Who keeps the lease's expiry*. There is no timer: the row holds the expiry and the host calls
      `bank.autolock()`.
    * *Flush and remake every instance*. A Vault stands through its lives, with a box listing per life.
    * The side quest on the two epochs and `damaged_wayin`. Neither exists.
    * The `del()` paragraph under *A throwing `requestCleartext`*. `vault.del` opens no gating.
  * Rewritten to the bank:
    * Rotation now rewraps every vault's boxes.
    * Lock timing, with `lease_revoke_failed`.
    * The passphrase once a bank has a passkey.
    * The passkey for a refused `add_passkey`.
    * Cross-device invalidation.
    * The deviceDB lease key (`bank_tok`).
    * The cached lease newer than the gate in hand.
    * The stamp as a parameter.
    * Rollback.
    * Asking every time.
    * The bank-level vacate.
    * The void vault (`ensureVault` asks nobody).
    * Two side quests: the deadline helper, which has no public deadline, and the forgetful user.
  * Kept as they stand:
    * The gate row landing between a write and its lease grant.
    * Gates visible to hosts.
    * Thread 19's React entries.
* **Decisions taken**:
  * In the changesets, only the 20261112-* files were harmonized. The older-dated ones were left as their threads
    wrote them.
  * notes/security.md's older per-vault entries were not amended. The new entries supersede them by date, which is
    that file's own convention.
* **Deviations**: notes/design-vaultdb.md was already deleted by thread 16, so there was nothing to do.
* **Discoveries**:
  * A twin worker wrote in this worktree for a while; the orchestrator stopped it. Its README edits were checked
    and kept, and its duplicate security.md entries merged.
  * For 17r (code):
    * `packages/safebyok/src/shapes/shapes-storage.ts` still exports `BoxFormat = 5002` beside shapes-bankdb's 5003.
    * `vault_empty` is in `refusalkindVals`, but nothing throws it.
    * errors.ts says `already_asking` is "on this bank", but the code refuses per device.
    * `gate_epoch` survives in validator.ts's doc example.
    * `Bank.demandPresent` (`bank_gone`) looks unreachable behind `demandEnabled`.
  * Left as snapshots in gallant*.md: examples that quote code since removed (`gate_epoch`, `landLock`,
    `KeptLease`, `this.world`, `parseMakeBankOpts`, a `Bank.hello()` "Lead with the job" pair).
* **Not re-traced**:
  * TODO *A storage read begun before a create can undo it* (Potential Optimizations). It describes a hello that
    reads the bankDB and the deviceDB in parallel. Today `device.#fetchBank` reads only the bankDB, so the entry
    may be removable; it is a Coach ruling, so it was left.
  * The *opening hello* bullet under Lock timing: renamed only.
* **For the Coach**:
  * **Wayin change and other devices.** Today a cached lease citing an earlier gate revision is forgotten
    (`Lease.buildFromCache`), so after a gate verb every other device proves again at its next unlock. A device
    already unlocked stays unlocked, and the verbing device gets a lease citing the new revision. This thread
    states that and does not decide whether it should stay. The TODO is *A cached lease newer than the gate in
    hand refreshes the gate*.
  * **gallant.md `#no-fake-values` and `#ask-the-host`.** The Gallant has `device_tok` as a required option of
    a synchronous `Bank.make`. The code does the opposite: `deviceDB.ensureCachedDevice` mints it. The pair's
    principle is contradicted, not just its names, so it is left for a ruling.
