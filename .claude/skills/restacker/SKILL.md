---
name: restacker
description: Restack a set of GitHub PRs into one linear chain so merging the top lands the rest — clean rebases first, tests once at the tip, force-push only with named leases. Manual invocation only; it rewrites and force-pushes branches.
argument-hint: "[PR numbers / ignore list / ordering, e.g. '40 45 46, ignore 52, restack 61 first']"
disable-model-invocation: true
---

# Restacker

Best run on Opus: the conflict and lease decisions are the whole job.

Restack the PRs named in `$ARGUMENTS` into one linear chain on the default
branch, so that merging the top PR (with a merge commit) makes every PR
below it go purple. Be quick but careful: batch the clean rebases, test
once at the tip, push the tip first, and don't let one hairy PR block the
rest.

`$ARGUMENTS` is free text: PR numbers (none given → all open PRs), PRs
to ignore, ordering overrides ("restack 61 first"), and any paths or
specifics. User instructions override the defaults below.

## Hard rules

- Never merge a PR.
- Force-push only with a **named** lease,
  `--force-with-lease=<branch>:<expected origin SHA>`.
- Do all checkouts and edits in the clone you create for this run (§2);
  leave every worktree of the repo, the main checkout included, alone.
- Use only the rerere resolutions this run recorded (§2): none from the
  repo's shared cache.
- A rebase that needs a judgement call gets aborted and set aside (see
  Conflict triage) — don't guess, don't drop either side's change, and
  don't let it block unrelated PRs.

## Delegation

One agent owns the clone. Rebases are serial by construction and share
one index and HEAD — don't farm them out or run them in parallel.
Concurrent rebases in a single clone corrupt each other, and a clone
per PR costs more in installs than it saves.

Delegate where output is large and the answer is small:

- test runs → `restack-test-runner`
- a set-aside conflict's meaning → `restack-conflict-scout`
- the final pushed chain → `restack-verifier`

Don't delegate merge-tree probes or `gh pr view` inventory: one bash loop
returns all of it for less than a subagent launch costs.

Subagents here are read-only — none may rebase, merge, commit, check out,
push, or write to the index. If they aren't installed, do the work inline:
for a test run, redirect the output to a log file and read only the tail
and the count lines, which keeps the suite out of context as well.

## 1. Inventory and plan

Check repo docs for conflict, test, and push conventions (e.g.
`PROCESS.md`); they override the defaults here. Default tests:
`pnpm justify`, plus `pnpm size` if that script exists.

```bash
gh repo view --json nameWithOwner,url,defaultBranchRef
gh pr view <n> --json number,title,state,isDraft,headRefName,baseRefName,url,body,isCrossRepository
```

Exclude and report: drafts (unless the user explicitly asked to include
one), ignored PRs, closed/merged ones, cross-repository PRs with no
pushable remote, and branches checked out in another worktree
(`git worktree list`).

**Existing stacks stay units.** PRs are already stacked if one's base ref
is another's head branch, a body already carries a "Stacked as/on" line
naming them, or one head is an ancestor of another
(`git merge-base --is-ancestor`). Keep a unit's order and contiguity.
A draft inside a unit is a judgement call (the PRs above it carry its
commits): flag it in the plan and, unless told otherwise, set it and
everything above it in that unit aside.

**Preview conflicts with `merge-tree`** before touching anything. It
simulates a three-way merge without changing refs or the working tree
(git ≥ 2.38):

```bash
git merge-tree --write-tree origin/<default> origin/<branch>   # one PR, or the top of a unit (covers the whole unit)
git merge-tree --write-tree origin/<A> origin/<B>               # two PRs that touch the same files
```

Run all probes in one loop; this isn't worth a subagent.

Exit 1 lists the conflicted files: the rebase will hit at least those, so
this is a lower bound on how hairy it will be. Exit 0 means it will
probably — not certainly — replay cleanly, since rebase applies commits
one at a time. This is triage only; the deliverable is a rebase, not a
merge. Also glance at `git log --oneline <old-base>..origin/<default>`
for renames or large merges that predict mechanical breakage.

**Order** (user overrides first): clean or trivially-conflicting PRs
before conflicting ones; among those, PRs that don't overlap each other's
files before ones that do; all else equal, lower PR numbers first.

Announce the plan in chat — order, units, exclusions, and what merge-tree
predicted — then proceed (don't wait for approval unless asked).

## 2. A clone of its own

The run works in a throwaway clone, not a `git worktree`, because
rerere's cache (`.git/rr-cache`) is shared by every worktree of a repo,
and so would carry in resolutions the Coach or another session recorded
(perhaps the ones that sent the Coach here). A clone has a cache of its
own, empty at the start, which holds only what this run resolves and
replays it only within this run: the same conflict meeting a rebased
branch again in §4 is resolved once.

```bash
git -C <repo> fetch origin
git clone --shared --no-checkout <repo> <repo>-restack-<timestamp>
git -C <clone> remote set-url origin "$(git -C <repo> remote get-url origin)"
git -C <clone> fetch origin
git -C <clone> switch --detach origin/<default>
git -C <clone> rev-parse --git-path rr-cache   # must be inside <clone>
ls <clone>/.git/rr-cache                        # must not exist, or be empty
```

(`--shared` borrows the repo's objects instead of copying them; plain
`--local` hardlinks fail across devices. Use a user-supplied path if
given.) Stop if the cache path is not inside the clone or the cache is
not empty. Prefix every later shell command with `cd <clone> && `. If
`scripts/clear-ds-store.sh` exists, run it now and again before cleanup.

Rerere is on from the global git config here, so it will act. Know when
it does: git prints `Staged '<path>' using previous resolution.`
(`Resolved '<path>' ...` without autoupdate), leaves no conflict markers
and no unmerged file, and still stops the rebase. A check for unmerged
files alone will not show it: grep the rebase output for `previous
resolution`, never filter that line out. Such a line is this run's own
earlier resolution, good or bad; if the conflict was hairy, diff the file
against what you meant. These resolutions stay in the clone's cache and
go nowhere: they are discarded with the clone and never reach the repo's
cache. Don't list the replays in the report; report the controversial
calls you made, as you would anyway.

## 3. Rebase in tranches

Tranche 1 is everything expected to rebase cleanly; later tranches add
the trivially-conflicting PRs. Test and push the tip at the end of each
tranche (§4–5) before starting the next.

For each PR in planned order:

```bash
git switch -C <branch> origin/<branch>
git tag <branch>-prerestack-<run-id> HEAD          # local rollback point
git rebase --no-update-refs --onto <new-base> <old-base>
```

- `<new-base>`: `origin/<default>` for the bottom PR; otherwise the
  rebased local tip of the PR just below it.
- `<old-base>`: the parent of this PR's first own commit — normally
  `git merge-base origin/<branch> X`, where X is the prerestack tag of
  the PR it was previously stacked on, else `origin/<default>`.
- Afterwards, `git log --oneline <new-base>..HEAD` should show only this
  PR's own commits, matching
  `git rev-list --count <old-base>..<prerestack tag>`. If it differs,
  understand why before going on: a commit already upstream being dropped
  is fine; another PR's commits being replayed is not (typically the
  lower PR was amended after this one was stacked — set `<old-base>` to
  the actual parent of the first own commit and redo).

If a PR is set aside as hairy, so is every PR above it in its original
unit (they carry its commits); PRs below it and unrelated PRs continue.

### Conflict triage

Resolve these yourself, following `PROCESS.md` where it applies:

- Changesets, docs: keep both, side by side.
- Import lists: union, in the file's existing order.
- `pnpm-lock.yaml`: take the new base's, then `pnpm install`.
- Tests broken mechanically by the base (renamed package/module, moved
  helper, changed fixture API): apply the same mechanical change — check
  what the base actually did rather than assuming.
- Formatting-only overlaps.

Hairy = resolving it means deciding which behaviour wins, dropping a
change from either side, or a large volume of conflicted files/lines.
A commit that deletes or empties text the base has since reworded or
added to around (a "move these entries out of TODO.md" commit meeting
a base that reworded them) is hairy even when both sides are docs: the
resolution is a ruling on whether the newer work stands. Also hairy: a
modify/delete conflict where the base removed a file on purpose
(resolve by honouring the deletion only if the PR's edit was a path or
wording fix; otherwise set aside).

A commit left empty by your resolution is dropped by the rebase, which
is usually right, but check that what it carried is already in the base
(`git diff <orig> HEAD -- <its files>`) before trusting it. Rerere's
replays are this run's own (§2); never run `git rerere` commands against
`<repo>`'s cache.
Then `git rebase --abort`, leave the origin branch untouched, and carry
on with the rest. Send `restack-conflict-scout` the branch, base, and
conflicted files; use its findings for the report rather than reading
both diffs here. A clean merge-tree preview followed by a conflicting
rebase is normal; triage it the same way.

## 4. Test at the tip, not per PR

The test suite is the expensive step, and a clean rebase will very likely
pass. Run it once per tranche, at the tip, before pushing — not after each
PR. `pnpm install` if the lockfile changed, then `pnpm justify` (and
`pnpm size`). Hand the run to `restack-test-runner` and work from its
report; it keeps several thousand lines of suite output out of this
context. Within that, use judgement: a tranche that differs from the last
green tip only by a changeset/docs conflict or a few clean commits
probably doesn't need its own run; one where you resolved code conflicts,
repaired breakage, or absorbed breaking base changes does.

Mechanical breakage: fix it as a new commit on the branch it belongs to,
then re-rebase each branch above using its previous local tip as
`<old-base>`. Autosquash only into branches you haven't pushed yet.
Anything red that needs judgement: push nothing from that tranche, report.

## 5. Push: tip first, named lease every time

The tip carries the whole stack, so its CI is the one that matters — push
it first so lower branches' CI doesn't compete with it for runners. Push
the tip as soon as its tranche is green, and again as the stack grows.
Once everything non-hairy is stacked and green, push the rest top-down.

For each push, take the lease SHA from a fresh `git fetch origin <branch>`:

```bash
git -c credential.helper= -c "credential.helper=!gh auth git-credential" \
  push --force-with-lease=<branch>:<fetched origin SHA> origin <branch>:<branch>
```

(Or the repo's usual push auth.) If the fetched SHA isn't the one you
rebased from, or the lease is rejected, someone pushed meanwhile: don't
retake the lease over their work — fold their commits in or set the PR
aside and report.

## 6. PR bodies

Afterwards, make the first line of each restacked PR's body exactly one
stack line, every PR linked, `(this PR)` after its own link, using the
real default-branch name and `<org>/<repo>` from `gh repo view`:

```
Stacked as main -> [#40](https://github.com/<org>/<repo>/pull/40) -> [#45](https://github.com/<org>/<repo>/pull/45) (this PR) -> [#50](https://github.com/<org>/<repo>/pull/50)
```

On the top PR only, append:
`**The top: merge this one, with a merge commit, and the whole line lands.**`
Replace any older first line starting "Stacked as", "Stacked on", or
"In the line"; keep the rest of the body unchanged. Often that old line
is a sentence of prose that begins "Stacked on #N (...)." and goes on
to say what the PR changes: replace only the stacking sentence,
parenthetical included, and keep the remainder as the next paragraph
(a regex for the sentence stops at the first ")." or "#N." and leaves a
fragment such as "(above #158, ...)." behind; read the result back)
(`gh pr view <n> --json body -q .body` → edit → `gh pr edit <n> --body-file`).
Set-aside and skipped PRs get no line and appear in nobody's.

The merge-the-top model needs every PR's base ref on the default branch.
Don't retarget PRs yourself; flag any that point elsewhere in the plan and
the report.

## 7. Clean up and report

Run `scripts/clear-ds-store.sh` again if present, confirm no rebase is in
progress, and that every restacked branch equals its origin. Bring the
rollback tags home (give `<clone>` as an absolute path), then remove the clone:

```bash
git -C <repo> fetch <clone> 'refs/tags/*-prerestack-<run-id>:refs/tags/*-prerestack-<run-id>'
rm -rf <clone>
```

The tags name only commits already in `<repo>` (the old tips), so this
moves refs, not history; if the fetch fails, list the old tip SHAs in
the report instead. Don't `rm -rf` a clone holding a branch that is not
pushed. Keep the tags as the rollback path.

Give `restack-verifier` the intended chain and have it confirm the pushed
state before you report.

Report:
- Per PR, one line: new tip SHA, and clean / what you resolved / why
  skipped or set aside.
- Tests: justify and size results with test counts, and at which tip.
- Pushes: what, in what order, each under a named lease.
- Set aside: files, both sides' intent, recommendation, and that the
  origin branch is untouched.