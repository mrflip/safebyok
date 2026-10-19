# Sprint `contract`: paused, 2026-10-19

**Why:** every remaining thread waits on one ruling. `a_sec` (#203), phase A's security fix-up,
had its second review flag one significant window, and a thread gets no third review, so the
finding is the Coach's. B2 builds on `a_sec`; B4 and B5 build on B2; phases C and D build on B.

**The ruling asked** (first row of *Open Matters* in the sprint doc,
https://claude.ai/code/artifact/362ec68d-5bf3-46aa-a379-59a9c8bfb548): if this device creates a
vault while another device deletes it, this device can end unlocked on the deleted vault, with a
lease, until its next read. It fails safe; closing it needs a new mechanism (a stand-down for the
create, as the lease take-up has). **Rec:** file `a_sec` as it stands and open a small thread
`a_sec2` for the create window, the stale-read rollback, the `notes/security.md` host-throw
sentence (condition only), and fastkey's README lines 72-80 and changeset. Flip the row to
*proceed* (or answer otherwise) and say "go".

## Where each thread stands

Filed, in one line (each PR's base is `main`; merging the top merges all):

main → #193 `rename_pass` → #194 `outcome` → #196 `vault_class` → #197 `fields_and_make` →
#198 `try_twins` → #199 `react_over_class` → #200 `getproof` → #195 `outcome_adapters` →
#201 `proof_wayin` (B1) → #202 `box` (B3) → #204 `a_fixes` (tip 50b15c25)

`pnpm justify` was green at each filing and at #202's restack.

Waiting, unfiled: `a_sec` (#203), in `/workspace/byok-a_sec` at 370baed6 (pushed), cut from
#195's tip 19c0cc87. Its reviews are on #203. Once ruled, it is restacked onto #204 (its thread
file lists the files `a_fixes` also touched) and filed; then B2 cuts from it.

Not started: B2 `lease`, B4 `put-wayin`, B5 `placement`, phase B's passes; phases C and D; the
policy session (the Coach's).

## Also waiting on the Coach

* About 75 *Open Matters* rows in `drafting`, each with a Rec. Those that steer the next threads:
  salts and wrapped keys in the snapshot (#201); which `adorn` (your triquet form, recommended);
  models taking the vault's props handed in (built that way; Contract to follow); the strength
  checker's name and whether it is required (B4); passkey_unavailable's place in the Contract.
* *For coach* rows: CLAUDE.md's stale `Wayin.open(...)` example.
* The main checkout holds your staged files on `20261018-reformx` (the preplan, rename plan, STYLE
  ensure paragraph, the sprint skill's per-thread review levels) and the unpushed `0e2df3be`: the
  preplan, rename plan and ensure paragraph are on the sprint's branches; the rest is yours.

## Resuming

Say "go" in this session (or hand a fresh one the sprint doc, `contract-plan.md` and
`contract-progress.md` in `whiteboard/20261019-contract/` on branch `20261019-contract`).
