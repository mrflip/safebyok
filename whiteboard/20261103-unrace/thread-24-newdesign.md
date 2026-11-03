# Thread 24: newdesign (2026-11-03)

Branch `20261103-newdesign`, stacked on #467; no PR yet, and nothing pushed, by the Coach's directive while the CI queue is wedged.
Justify: green; core 4794 passed, 37 skipped; empty changeset. A later worker corrects the design docs' contents and adds to this file.

* **Built**:
  1. `Lease.peek` leaves a row past autolock and answers null: no erase, no throw, reversing thread 23 by the Coach's ruling. A row
     of another epoch or stamp keeps `uncacheForgotten`, on its own branch, judged first. Mutations biting: dropping the branch fails
     10 rows of the four test files; restoring thread 23's erase fails 8. G4, `bank.autolock`'s doc line and `notes/security.md`
     (through a `sonnet` subagent; its diff checked) say so.
  2. The moves: the specs to `whiteboard/20261102-newdesign/` as `newdesign-models.md`, `newdesign-proof.md`, `newdesign-vaultdb.md`
     and `reference-timings.md`; `unrace-preplan.md` and `noted.md` to this folder. Pointers corrected across the tree, historic
     thread files included; inside the docs, nothing but pointers changed.
* **Decisions taken.**
  * A row past autolock of another epoch is still uncached: the epoch is judged first, as such a row is no use to this vault at any age.
  * Empty changeset, as thread 23's: `Lease.peek` is reached by no public entry point yet.
* **Discoveries.**
  * `notes/wontfix.md` named `unrace-new_vault.md`, deleted in 899531a08 before this thread; it now names the commit holding it, e135d0352.
  * No `.claude/` skill and nothing in `notes/security.md` or `notes/guarantees.md` matched the old paths.
