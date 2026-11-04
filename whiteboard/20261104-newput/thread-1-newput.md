# Thread 1: newput (2026-11-04)

Branch `20261104-newput`, PR pending, off main at b83afc28. Justify: green at each commit so far.

Spec: `whiteboard/20261102-newdesign/newput-plan.md` in the base checkout (untracked there).

* **Built**:
  * Commit 1, void sentinels: `VoidRevision`, `VoidRevisionSeq`, `VoidRevisionTok`, `VoidLifeTok`, `VoidTime`. `#neverStoredOf` is gone, so a new instance's central is the one stable void revision. `BoxProps` is `BoxHalves`.
* **Decisions taken**:
  * `VoidRevisionTok` is the zero UUID as well as `VoidLifeTok`: the plan's ruling says "a zero tok".
  * The 2008 date's constant is `VS.VoidTime`, beside the other sentinels, not in `consts.ts`: nothing outside the vaultDB's shapes names it.
  * The changeset is empty: no entry point exports `models/` or the new vaultDB.
