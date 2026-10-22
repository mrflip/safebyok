# primitives: progress

What the sprint's threads have taught, newest wins. Workers look things up here; the orchestrator
keeps it. Newer than the plan and the spec wherever they disagree.

## Rulings in force

* **The spec is `primitives.md`** (2026-10-22): the demand model, the four mutexes, the primitives
  and the chains. It supersedes the streamline sprint's rulings except tombstones and
  `vault_epoch`, which stand.
* **Try pairs** (2026-10-22): every public method is `x` and `tryX`; doc block on the throwing one;
  implement the easier half and derive the other.
* **`vault.checkStrength(passphrase)` is public** (2026-10-22), today's `checkPassphrase`; a chain
  calls it through its copy of the vault.
* **Deleting a vault is proven** (2026-10-22): `del()` raises `del_vault`.
* **Whisper-omitted `putBox` reads first** (2026-10-22): the listing stays summaries; ergonomics
  reconsidered after the sprint.
* **A late read of this tab's own gate write is ignored** (2026-10-22): "ship what we have, tell
  people to report what is wrong and we'll fix from both ends".
* **`cipheredWith` / `decipherWith`** for like-for-like, `extractWhisper` where one thing becomes
  another (2026-10-22).
* **The dialog is the only door** (2026-10-22): the app invokes the call, the gating is raised,
  the dialog's output becomes provings, and the attempt makes the change. The app never holds a
  proving.
* **No refresh bookkeeping** (2026-10-22): a refresh does not note a box this tab wrote while it
  ran; the next write refuses `stale_write` and a hello cures it.
* **A sidecar-only change is `getBox` then `putBox`** (2026-10-22); ergonomics after the sprint.
* From the streamline sprint, still in force: `putVaultProps` resolves the stored props;
  `ensureVault(draft)`; tombstones on `del()` and `delDamagedVault`; `vault_epoch` moves on the
  vault's core fields only; no back-compat for pre-rename vaults; security notes through a
  `sonnet` subagent, the Coach audits the file after the sprint; wire meta in the body.

Otherwise, until the Coach rules on an Open Matter, threads take its Rec (the plan, *Ground
rules* 3).

## Threads

| # | Label | Status | PR |
|---|---|---|---|
| 1 | renames | filed | #243 |
| 2 | get_vault | filed | #244 |
| 3 | wire_meta | filed | #246 |
| 4 | store_verbs | planned | |
| 5 | demand | planned | |
| 6 | lease_box | planned | |
| 7 | bank | planned | |
| 8 | proving_gate | planned | |
| 9 | gating | planned | |
| 10 | react | planned | |
| 11 | docs | planned | |

## What the threads found

### From the streamline sprint (threads 1 and 2)

See `whiteboard/20261021-streamline/streamline-progress.md`, *What the threads found*, for
#243 and #244: the names, the shapes, the interim gateless handling thread 7 replaces.
