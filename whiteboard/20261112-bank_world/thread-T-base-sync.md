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
