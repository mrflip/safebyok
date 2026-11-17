# Thread 24: newdesign (2026-11-03)

Branch `20261103-newdesign`, stacked on #467; no PR yet, and nothing pushed, by the Coach's directive while the CI queue is wedged.
Justify: green; core 4794 passed, 37 skipped; empty changeset. 

* **Built**:
  1. `Lease.peek` leaves a row past autolock and answers null: no erase, no throw, reversing thread 23 by the Coach's ruling. A row
     of another epoch or stamp keeps `uncacheForgotten`, on its own branch, judged first. Mutations biting: dropping the branch fails
     10 rows of the four test files; restoring thread 23's erase fails 8. G4, `bank.autolock`'s doc line and `notes/security.md`
     (through a `sonnet` subagent; its diff checked) say so.
  2. The moves: the specs to `whiteboard/20261102-newdesign/` as `newdesign-models.md`, `newdesign-proof.md`, `newdesign-vaultdb.md`
     and `reference-timings.md`; `unrace-preplan.md` and `noted.md` to this folder. Pointers corrected across the tree, historic
     thread files included; inside the docs, nothing but pointers changed.
  3. The three docs corrected, in the Coach's wording, against the code and the rulings: `newdesign-proof.md`, `newdesign-vaultdb.md`,
     `newdesign-models.md`. Diagrams redrawn from `src/models/`: hello, send, lease make/attach/vacate, `build_vault`, `unlock_vault`,
     the gate change, `replace_passphrase`, `add_passkey`, `revoke_passkey`, `del_vault`. Rows added: the vaultDB's `vault_mismatch`
     (VPA7); `Gating.launch`'s `bad_option`; `gating.declineAtDiscard()`. End-of-method checks struck, by the Coach's cancelling them.
* **Decisions taken.**
  * A row past autolock of another epoch is still uncached: the epoch is judged first, as such a row is no use to this vault at any age.
  * Empty changeset, as thread 23's: `Lease.peek` is reached by no public entry point yet.
  * "Not built yet" markers only where the doc already speaks to a ruling: swept and vacated banks done (proof, models), `vault.hello`
    called by the host (models), `vaultBoxes(vault)` (vaultdb), a damaged row cleared with the customer's own tools (proof).
  * A pseudo-code line that reads differently from the code stays unless it misleads about what happens. Anything uncertain went to the
    orchestrator's proposal list, not into the docs.
* **Discoveries.**
  * `notes/wontfix.md` named `unrace-new_vault.md`, deleted in 899531a08 before this thread; it now names the commit holding it, e135d0352.
  * No `.claude/` skill and nothing in `notes/security.md` or `notes/guarantees.md` matched the old paths.
  * The rulings files are not in this branch's `whiteboard/20261103-unrace/`: `unrace-plan.md`, `unrace-progress.md` and
    `20261102-newdesign/unrace-nextplan.md` were read in `/workspace/byok-unrace`.
  * The docs' `notes/security.md` rows (proof, *Guarantees to amend* and *To fix*) stand unchecked: this thread does not read that file.

## Corrections resting on the worker's own reading

Made against the code, not a ruling. Line numbers are at the docs' correction commit; the *Areas of Concern* came after, at each file's end, so they still hold.

* `newdesign-proof.md` L210, L247, `newdesign-models.md` L129: `vacate`'s order is now "disable; vacate the lease, the cached row too; vacate children; settle its gating". It disables first and makes no `lock()` call.
* proof L221: a vacate marks itself done "before its erase".
* proof L229, models L216: no lock check inside `attempt`. A lock settles the gating, and a later attempt refuses `gating_landed`.
* proof L254, models L229 (a birth's `ensureVault`), models L141: a refused put "holds only what its answer delivered".
* proof, the prose after `build_vault`: over a live row the put declines ("another won"); a newer tombstone refuses `stale_write`.
* models L139: dropped "the only seam that does", since `#buildOrReceive` replaces wherever `fateOver` says.
* models L136: `vaultListing.at` answers a vault, tombstone or null; a birth's prior comes from `demandBirthSlot`.
* proof, `delVault`'s end row, and models' `del_vault` row: box rows are tombstoned, not gone. The Vault is tombstoned in its slot, not vacated.
* models' `locked_while_asking` row under gate changes: "no lease, as the lock left it".
* proof `revoke_passkey`, models L289: with none held, `vault.revokePasskey()` answers the vault, not `revoked`. The store's own `revoked` moves nothing.
* proof, the last paragraph of `del_vault`: a `putBox` of the wrong `vault_tok` refuses `vault_mismatch`, `vault_gone` or `vault_empty`, not always `vault_mismatch`.
* models L90, L117: at model level the refusals are `absent_box` and `vault_gone`.
* `newdesign-vaultdb.md` L105: the `damaged_records`-for-boxes row is relabelled `getVault`, from `getBank`.

## The Coach's rulings on the docs' open list

Models: `box.expose`, the `whisper` setter, `boxListing.create`, `lease.evict()`, `vault.takeWorld`, `vaultListing.demandBirthSlot` and `vaultListing.vacate` have rows, from the code; "postponed" now says only `useWhisper`. Preconditions: `bank.ensureVault`, `bank.vaultOf` before ready. `Lease.peek`'s `damaged_lease` throws, not bad news. A new bullet in *Areas of Concern*, on `vault.ensureUnlocked()` and `requestCleartext`.

Proof: *Guarantees to amend* and *Rows for `notes/wontfix.md`* deleted; four rows moved to `notes/wontfix.md`. The one unlanded guarantees row, *Passkey on a new passphrase*, went to the orchestrator for next sprint's plan, as VOCABULARY.md and the README describe the shipped old code. The PR tip mentions are struck; the "For this sprint" lines stand as plain statements. Vaultdb: `getBank`'s `damaged_records` row is marked going, next sprint. Proof's `vaultListing.ensureVault` lines stand, by the Coach's word.
