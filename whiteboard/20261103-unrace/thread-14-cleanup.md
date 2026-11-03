# Thread 14: cleanup (2026-11-03)

Branch `20261103-cleanup`, stacked on #465 (thread 22, `20261103-tidy_host`). Justify: see the PR. Empty changeset.

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
  5. The specs in `whiteboard/20261102-unrace/` (`noted.md`, `models-invariants.md`, `unrace-gating.md`,
     `unrace-preplan.md`, `vaultdb-invariants.md`) changed plainly on the listed lines: `ensureUnlocked` asks
     first, no lock check at the attempt, `bank.autolock` out of `hello`, `listing.del` takes the record,
     `vault_mismatch`, `deleted`, `putVault` `fail|get` and `camped`. The Coach's edits to
     `models-invariants.md` are kept.
  6. `VOCABULARY.md`: the gating kinds (`build_vault`, `unlock_vault`, `replace_passphrase`, `add_passkey`,
     `revoke_passkey`, `del_vault`), `putGate` named as the vaultDB calls, `dna` handed to `create`, rows for
     `act`/`world`/`dbhas`, `am` and `camped`, `stage` (`made`, `ready`, `refused`) where it and `STYLE.md` said
     `lifecycle`, `passkeyClear`. `notes/security.md` through a `sonnet` subagent: the enter-key rule added, the
     delete entry corrected (`vault.del()` and `revokePasskey` are gated; `listing.del` is not), older entries
     marked as about the shipped core.

* **Decisions taken**
  * Doc blocks that state behaviour, not a refusal list, stay; no `SLOPDOC` added.
  * `spendAnswer` (old `src/gating.ts`) and `spendClears` (models) are both named in `guarantees.md`.
  * Beyond the list: the fixed tombstone line in the hello tree and `del(ante)` in `models-invariants.md`.

* **Deviations / skipped**
  * `unrace-preplan.md:135` mentions `tidy`, but it is a quotation of the Coach: left.
  * The README's change-passphrase passages (lines ~818, 837-843, 948) and `VOCABULARY.md` lines 15-16 still say a
    new passphrase removes the passkey. They describe the shipped core (`src/vault.ts`, `putWayin`), which still does;
    the models keep the passkey (`replacePassphrase leaves the passkey alone`). Changing them now would make the
    shipped docs false. They change when the models replace the core.
  * `VOCABULARY.md`'s `stage` row still describes a vault's stage in the listing as `ready|refused`; the models'
    `VaultSnapshot` has no `stage`. Left for the thread that reshapes the listing.

* **Discoveries**
  * `scripts` proof (`removeComments` printer) is a way to prove doc-block-only changes; its helper lives in the
    scratchpad, not the repo.

* **For the Coach**
  * G6/G7 amendment in `notes/guarantees.md`: a whisper crossing box to lease as an unzeroable string.
