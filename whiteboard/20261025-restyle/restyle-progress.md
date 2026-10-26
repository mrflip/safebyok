# restyle: progress

What the threads have taught, newer than the plan wherever they disagree. Kept by the
orchestrator; workers look things up here and write their own thread files.

## The line

main → #265 → #252 → #268 → #269 → #270 → #266 → #267 (the primitives line, unmerged) → restyle
threads 2 to 13 → the sprint PR. Thread 1 (`guidance`) stands on #267 beside the line.

## Decisions so far

* *Orchestrator:* stored records parse strict both ways (the preplan's suggestion): an unknown
  field reads as damage or a newer `format`.
* *Orchestrator:* the restyle stacks on #267, not `main` (plan, *Base*).

## Discoveries

* *Orchestrator:* **STYLE.md carries the rules from #272 on** (thread 1): NEWSTYLE §1–§10 are its
  sections *Build for maintenance*, *Shapes and duck typing*, *Crossings, spreading and logging*,
  *Stateful objects and snapshots*, *Order comes from an explicit list*, *Scopepaths*,
  *Tree-shaking*, and a rewritten *Validation*. A thread cut from #267 does not hold them yet:
  it reads NEWSTYLE.md.
* *Orchestrator:* **a PR's base is `main`**, with "Stacked on #N" in its body. Workers may find
  `gh pr edit` and `gh pr ready` denied; they report it and carry on, and the Coach is asked.
* *Orchestrator:* the lint's `^_[a-zA-Z0-9]` flagged nothing in `src/` (`args: 'after-used'`
  never reported `(_, ii) =>`); write named ignores anyway.
