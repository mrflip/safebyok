# restyle sprint: paused again, 2026-10-27

Paused at the Coach's request (usage limit), after thread 14. Nothing is running: no worker, no
timer. Plan: `whiteboard/20261025-restyle/restyle-plan.md` on the sprint branch
(`20261026-restyle`, [#271](https://github.com/mrflip/safebyok/pull/271)); sprint doc: [Sprint
restyle](https://claude.ai/artifact/4Hx2VL1fu4qUMQV9z6rJFz).

## Where things stand

| Thread | PR | State |
|---|---|---|
| 1 guidance (reworked onto main) | [#272](https://github.com/mrflip/safebyok/pull/272) | filed, reviewed `fixed`; ready to merge |
| 2 to 12 | #273 to #283 | merged |
| 13 bank_listing | [#286](https://github.com/mrflip/safebyok/pull/286) | filed, reviewed `clean`; ready to merge |
| 14 rulings | [#287](https://github.com/mrflip/safebyok/pull/287) | filed, reviewed `fixed` (a host's sidecar was frozen in place; fixed); stacked on #286 |
| cleanup: changeset clauses | [#288](https://github.com/mrflip/safebyok/pull/288) | filed; ready to merge |
| cleanup: security notes | [#289](https://github.com/mrflip/safebyok/pull/289) | filed; ready to merge |
| 15 tidy | none | not started |
| 16 retire_standing | none | not started; the Coach's prompt is `unstanding.md` |

Merge order: #286, then #287 (it stands on #286). #272, #288 and #289 are independent of the
line and of each other.

## To resume

* **Thread 15** stands alone once #287 merges: cut it from `origin/main`
  (`scripts/cut-thread tidy origin/main`), or from #287's tip if it is still open. Its gloss in the
  plan holds everything the rulings and reviews left for it.
* **Thread 16** runs after 15, from the Coach's `unstanding.md`.
* The sprint doc: Open Matters holds the rows still waiting on the Coach (drafting); Cleanup's
  *Finally* is the closing checklist; 70 rulings are already in `restyle-resolutions.md` and on
  their PRs.

## Needs the Coach

* #287's review left minor findings (in the plan's thread 14 *Review:* line, headed for thread 15); I did not add them as doc rows, to save usage.
* Open Matters, `drafting`: the four rows from #287 (TOP: Convex's validators from the core's
  Zod, needing a yes for a converter or a dependency; `Validators` exporting internals; a store in
  the vault bag ignored; box rows typed `unknown`), the four from #272's review, three from #286,
  and older rows still drafting.
* Your main checkout holds `whiteboard/20261025-restyle/` untracked (now on main and on the sprint
  branch): delete it before pulling, once you have checked it holds nothing newer.
