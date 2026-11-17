# 20261014-staged_publish: resolution

A -human report on staged publishing (`npm stage publish`) and `pnpm bump`, built by [#11](https://github.com/mrflip/safebyok/pull/11): three checks only the Coach could make against a real release. Gripes from its -human report and its PR, as consolidated in `whiteboard/20261016-gripes_boogaloo/` (2026-10-16).

6 gripes: 2 unresolved, 4 resolved.

## Unresolved

- G441 Find out whether a staged version keeps its `--tag` on approval (a non-`latest` tag never tried) — todo_gripes, old_gripes, humans_gripes
- G445 Decide whether to use the trusted publisher's dist-tag permission (on, unused) — todo_gripes

## Resolved

- G419 Build releases: changesets, Version PR, per-package tags, lockstep group, staged npm publish → done (PR#11, PR#15, PR#16, PR#22)
- G424 Verify the trusted publisher accepts the rewritten workflow and provenance survives staging and approval → 0.1.0 published with SLSA provenance (old_gripes, Addressed)
- G429 The dist-tag permission lets a workflow repoint `latest` without 2FA → Coach marked fixed (old_gripes, Addressed)
- G430 Limit the `npm` environment to main, add required reviewers; can a rejected stage be restaged? → Coach NOTED: "still a one-person project" (Coach ruling, old_gripes Addressed)
