# Sprint storable: paused, 2026-10-30

Paused because every remaining thread waits on the Coach. Sprint doc (Open Matters, Cleanup,
Progress): https://claude.ai/artifact/Hup5kM2KFxxbXHDcR76wKB. Plan and progress:
`whiteboard/20261030-storable/` on branch `20261030-storable` (sprint PR #369).

## The base

At the Coach's request (via session byok-ed), the line stacks on **#374** (`20261030-vault_model`,
on #368). Threads 1 and 4a were rebased onto it locally, cleanly, `pnpm justify` green, but the
force-push with lease was refused by the permission classifier. So:

* origin's `20261030-models_world` (#370) and `20261030-timeliness` (#371) still sit on #368;
* the local branches of the same names hold the restack (f07026cb and ce0fca2f), with copies at
  `restacked/20261030-models_world` and `restacked/20261030-timeliness`;
* threads 4b, 5 and 7 were cut from the local restack and pushed; their PRs carry the restacked
  #370/#371 commits until the restack is pushed.

To go on: allow `git push --force-with-lease=<branch>:<old sha>` on this sprint's thread
branches, or push the two branches yourself:
`git push --force-with-lease=20261030-models_world:5b80fd21 origin 20261030-models_world` and
`git push --force-with-lease=20261030-timeliness:06929fd9 origin 20261030-timeliness`.

## Threads

| Thread | PR | State |
| --- | --- | --- |
| 1 models_world | #370 | filed; restacked onto #374 locally |
| 4a timeliness | #371 | filed; restacked onto #374 locally |
| 2 reconcile_rows | #373 | filed (after a rework on the Coach's rulings); on old #370, moves at the final restack |
| 5 snapshot_props | #376 | filed, on the local restack |
| 7 box_dna | #377 | filed, on the local restack |
| 3 listing_pipeline | #372 | **waits on the Coach**, unfiled in `/workspace/byok-listing_pipeline` (second review flagged: a delivery refusal no longer reaches a `fetch`/`put`/`del` caller) |
| 4b verbs_guards | #375 | **waits on the Coach**, unfiled in `/workspace/byok-verbs_guards` (review flagged: central can move while `edit` awaits `makeStaged`) |
| 8 if_present | | not started: waits on 3 and 4b, and on the `ifPresent`-vs-hydrate row |
| 6 model_guarantees | | not started: waits on every other thread |

## What would free the most

1. The TOP row on whether a `fetch` throws what `receive` refuses (frees 3, then 8).
2. The TOP row on central moving mid-`edit` (frees 4b, then 8).
3. The TOP row on `ifPresent: 'fail'` never firing because `send` hydrates first (shapes 8).
4. The force-push permission (lets the restack onto #374 reach origin).

Every other open question is a row in *Open Matters*, one per matter, TOP first in importance.
