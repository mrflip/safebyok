# Thread 1: newput (2026-11-04)

Branch `20261104-newput`, PR pending, off main at b83afc28. Justify: green, but for 90cf9b74 (see Discoveries).

Spec: `whiteboard/20261102-newdesign/newput-plan.md` in the base checkout (untracked there).

* **Built**:
  * Commit 1, void sentinels: `VoidRevision`, `VoidRevisionSeq`, `VoidRevisionTok`, `VoidLifeTok`, `VoidTime`. `#neverStoredOf` is gone, so a new instance's central is the one stable void revision. `BoxProps` is `BoxHalves`.
  * Commit 2, `demandNotHeld` out, its tests re-made by hand from stash 0. `create` holds a temporary `this.scopeOf(dna)`, since `demandNotHeld` was what checked the scope; `puttable` takes that over in commit 6.
* **Decisions taken**:
  * `VoidRevisionTok` is the zero UUID as well as `VoidLifeTok`: the plan's ruling says "a zero tok".
  * The 2008 date's constant is `VS.VoidTime`, beside the other sentinels, not in `consts.ts`: nothing outside the vaultDB's shapes names it.
  * The changeset is empty: no entry point exports `models/` or the new vaultDB.
* **Discoveries**:
  * 90cf9b74 was pushed with one test red (`refuses 'bad_scope' a dna naming another vault`): my scratch justify wrapper's exit status was its filter's, so `&&` went on past a red run. The wrapper is fixed; the next commit repairs the test. No commit after it is red.
