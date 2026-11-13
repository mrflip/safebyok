# Thread T: how base-sync works (2026-11-12)

Spun out of `thread-T-sprint_tools.md`; for whoever changes `.claude/agents/base-sync.md`.

It snapshots to `<git-common-dir>/base-sync/<ts>/` (status, patches,
file copies with mtimes, refs `refs/base-sync/<ts>/{head,stash}`; its own stash entry is
dropped once anchored, never anyone else's). Build detached: origin/main, each stack branch
(rebased only when not already on the one below, committer date = author date so reruns make
the same SHAs), the sprint's directory and `human/` squashed into one commit dated at the
sprint's tip, then the base branch's own commits picked in order. A conflicting pick is
retried with `-X ours`: the stack's side wins, the clean hunks stay, and the conflicted files
are kept in `dropped/<sha>/` for the report. Uncommitted changes are classified by three-way
`git merge-file` and author times (identical, untouched, contained, merges, overlaps,
deleted-vs-changed, binary, carried), each verdict mapped to an action by an awk table the
agent may overrule on content; "when unsure, merge or conflict, never drop". Conflict markers
left by a run come back as `carried` on the next and are restored untouched.

## Decisions, approaches set aside, and the scratch test

Moved here from the thread file, to keep it short.

* **Decisions**:
  - base-sync's snapshot root defaults inside `.git`, which outlives a session scratchpad.
  - On a base-only commit's conflict the stack wins by default (the Coach's word), clean hunks
    kept; whole commits are left out only on a delete/modify conflict.
  - Staging comes back only for `untouched` rows; elsewhere it is lost, and reported.
* **Set aside**:
  `checkout --ours` on conflicted files (would drop the commit's clean hunks in them); aborting
  and leaving out a conflicting base commit whole (the first draft; superseded by the Coach's
  "stack wins" ruling); `%ct` for change times (a rebuild stamps the run time); trusting
  `git diff --diff-filter=U` alone for an empty pick (rerere stages its replay, which made a
  real commit read empty: rerere is now off for every pick and rebase).
* **Scratch test**:
  - base-sync's scratch test: a `git clone --shared` world (scratchpad `sprint_tools/setup.sh`)
    with a stack, a sprint branch, a base branch holding every kind of commit and one
    uncommitted change of each kind. The last two of four `opus` runs gave the expected verdict
    on every row, identical SHAs and restored files on a second pass, and a pre-existing stash
    untouched.
