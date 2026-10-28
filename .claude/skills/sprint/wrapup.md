# Wrapping up a sprint

Read by the orchestrator when the last thread files, or the sprint pauses for good (SKILL.md, §5).
The sprint doc's *Cleanup* tab, *Finally*, is this wrap-up's checklist for the sprint at hand:
work through it beside the steps below, tick each item as it lands, and carry any still open
into the done note.

1. **Restack** the filed threads into one line on `origin/main`. A stack the threads already form
   keeps its order; peers go biggest and messiest first, so the large changes merge first and the
   small ones adapt. In a worktree of your own (a name no other session uses), rebase each branch
   onto the one below with `--no-update-refs`. A conflict goes to a fresh `thread-worker`, handed
   the thread file and the new base, which resolves it, proves it, and pushes. When every rebase
   is clean, run `pnpm justify` (and `pnpm size`) once, at the top, and let CI check the middle.
   Push each branch with a lease on the SHA it replaces (`--force-with-lease=<branch>:<old sha>`),
   and rewrite each PR's first line to "Stacked on #N, in the line main → #A → #B → …". Check the
   bottom stands on today's `origin/main`, not on an unmerged PR whose commits `main` already
   holds under other SHAs.
2. **Sweep the rulings.** Hand a `sonnet` subagent the doc's link and the sprint directory: it
   reads *Resolved* and *Cleanup*'s *Your calls* once, writes `<sprint_name>-resolutions.md` there -- each matter as the row
   put it and the Coach's answer word for word, with where it was raised and where the work went,
   newest batch first, the calls left to you as such -- and clears both. It is turbochat's *Carrying a ruling back*, done
   once at the end.
3. **Close the sprint PR.** Set the plan's status line; add `human/YYYYMMDD-sprint_<name>_done.md`
   -- the sprint in a paragraph, the PRs in merge order with their "Stacked on" notes, YOLO
   decisions if any, and the questions still open, gathered in one place (what the Coach resolved
   is in the resolutions file: point to it); commit. Tag the tip and push the tag
   (`sprint/YYYYMMDD-<name>`), so its history stays on GitHub. Then squash the sprint branch into
   one commit on top of the line, push it with a lease, and take the PR out of draft
   (`gh pr ready`). It is the line's top: merging it merges everything. Only the sprint's
   whiteboard directory and `human/` entry ride on it: anything else is a PR of its own.
4. **Finish.** Bring *Progress* up to date a last time, `git worktree remove` your worktrees, and
   give the Coach the closing summary in chat, leading with what shipped, what the reviews fixed
   and left, and what needs their word, with the PRs in merge order and the top named. Never
   merge anything.
