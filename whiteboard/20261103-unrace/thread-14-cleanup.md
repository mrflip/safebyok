# Thread 14: cleanup (2026-11-03)

Branch `20261103-cleanup`, stacked on #465 (thread 22, `20261103-tidy_host`). Justify: not yet run. Empty changeset.

No behaviour changes. One commit per kind.

* **Built so far**
  1. `notes/wontfix.md`: four rows (a lock's refused erase reopening with no proof; a refused erase with no `onPanic`
     and the false prompt; a delete with a refused erase and no `onPanic` still landing; a host getter's `VaultError`
     quoting the passphrase), the Coach's words where given.
  2. `notes/guarantees.md` and the README's `unexpected_error` row: see the PR body, which marks G6 and G7 for the
     Coach's review.
  3. `STYLE.md`: a note at the top of *Comments and doc blocks*; nothing else in the section changed.
  4. Doc blocks in `src/models/*.ts` and the named `src/storage/` files: refusal lists and pointers to blocks that no
     longer say it cut. Proof: `removeComments` printer, base and tip, 16 files compared, 0 differ.
