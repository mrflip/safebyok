# gripeoween (2026-10-28)

A triage of everything still asked for, as of `main` at `f2af68e4` (#313 merged), into three shelves:

* `gripeoween-todo.md` -- wants work or a decision now; grouped by what unblocks it, readiest first.
* `gripeoween-closed.md` -- answered: built, ruled, or overtaken. Each says what closed it.
* `gripeoween-notyet.md` -- reasonable, deferred: a design question stands in the way, or the Coach shelved it.
* `gripeoween-context.md` -- background for the items whose row alone does not carry the question (marked **ctx** in the shelves).

Ids are `GW-nn`, shared across the four files; an item sits on one shelf only.

## Sources read

* The fixup sprint doc's *Open Matters* tab (21 rows, every one `proceed` or `explain`, none swept to
  *Resolved*), its *Cleanup* tab (the `Finally` checklist) and its empty *Resolved* tab.
* `TODO.md` and `NOTYET.md` whole; `notes/wontfix.md`.
* `notes/security.md`: the entries since 2026-10-26, and every passage naming a TODO, an open
  matter or later work (lines 570, 853, 966, 1475, 1927-1930, 2023, 2148, 2572, 3066).
* Whiteboards: `20261027-fixup_sprint` (plan, progress, resolutions, the five thread files),
  `20261027-validator_ducks` (plan's open questions, sweep rules), `20261026-fixup` (the preplan),
  `20261027-catchsweep` (plan and progress, read from its worktree), `20261021-better_paths`;
  winboards `20261025-restyle` (resolutions' *Left to the orchestrator* and *after the close*,
  `unsettled.md`) and `20261022-primitives` (`revised-outcomes.md`, `primitives-toldjaso.md`).
* The open PRs' bodies (#314 to #321) and the merged list (#251 to #313).
* Not re-triaged: `20261016-gripes_boogaloo/gripes-list.md` (249 gripes as of 2026-10-16). It predates
  the reform, the primitives sprint and the restyle; most of its ids name code that no longer
  exists. Its *Deferred by the Coach* section is restated in NOTYET.md already. A fresh pass over it
  would be its own thread; nothing from it is carried here unless TODO.md or NOTYET.md already does.

## How "closed" was judged

Where a row said "rename X" or "fix Y", the code on `main` was checked (`grep`), not the PR's
claim. Where the check found the work undone, the row is in the todo shelf with the file and line.
Where a Coach's answer was a question, the row went to the todo shelf's *Needs the Coach's answer*
group and has a context section, never to closed.
