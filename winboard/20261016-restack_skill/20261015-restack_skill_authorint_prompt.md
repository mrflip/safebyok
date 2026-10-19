write a claude skill `/restacker [details and clarifications, eg "ignore these PRS and restack PR#X first"]`
given a list of prs, restack them as quickly as reasonable

Please "restack" prs into a linear chain, so that merging the top makes the others go purple. Do this in a time and resource-efficient way. Background:
1. when prs are already stacked, handle them as a unit
2. ignore PRs that are in draft mode
3. given free choice, restack ones with no (or only trivial) merge conflicts first; all else equal put higher number PRs after lower-number ones. You may be able to identify potential for merge conflicts and integrate that into your planning.
4. running the justify tests over and over costs time, and it's very likely that a clean or mostly-clean rebase will pass the tests
5. push the most important CI job (head of the stack) first, so that the others don't compete for containers with it
You may wish to proceed as follows:
* stack everything that rebases cleanly, and run `pnpm justify`. If that is green, force-push the tip with a **named lease**
* continue to restack, using your judgement about when to run the full test suite. As you get to a green result, force-push-with-named-lease the tip.
When you have completed restacking everything not-hairy and pushed the tip, also force-push-with-named-lease each other PR.
Edit each pr message to have the line eg "Stacked as main -> #40 -> #45 -> #47 -> #48 (this PR) -> #46 -> #50". Each PR in this line should be a link `[#12](https://github.com/<org>/<reponame>/pull/12)`, not a bare number
If a rebase is hairy -- requiring significant judgement calls, or large edit or file volume -- set it aside and report what you found in chat and in your summary

The above is the strategy to follow. The below has specifics from a certain run while developing my prompt, demonstrating specifics about each step; if it varies with the above in strategy, follow the above.

Steps:
1. `git -C /workspace/byok fetch origin`, then `git -C /workspace/byok worktree add --detach /workspace/byok-gp2-restack3 origin/20261016-validators_tightening`. Begin every later shell command with `cd /workspace/byok-gp2-restack3 && `. Run `scripts/clear-ds-store.sh` there before rebasing.
2. For each row in order: `git switch -C <branch> origin/<branch>` (local branch reset to origin's tip; these branches are checked out nowhere else), tag `<branch>-prerestack4` (local only), then `git rebase --no-update-refs --onto <new base> <old base>`. After each, confirm `git log --oneline <new base>..HEAD` shows only that PR's own commits (a handful each).
3. Conflicts: resolve the straightforward ones yourself per PROCESS.md (changesets and docs side by side, import lists, the lockfile by taking the base's then `pnpm install`, tests the base broke mechanically). Main gained a large merge since these were built (identity revocation, damaged bundles, eraseDamagedVault, a VaultDB battery in the test helpers, IndexedDB fixes, `safebyok-argon2-wasm` renamed `safebyok-fastkey` perhaps -- check). If a conflict needs a judgment about which behaviour wins, or would drop a change from either side: `git rebase --abort`, stop, and report it with the files, both sides' intent, and your recommendation. Do not push anything in that case.
4. When all five rebase cleanly: `pnpm install`, then `pnpm justify` and `pnpm size` once, at the top (#100's branch). Repair only mechanical breakage (commit it on the branch where it belongs, with a fixup that you then autosquash only if that branch is not yet pushed -- simpler: a new commit on the right branch, then re-rebase the ones above it). If anything red needs judgment, stop and report, no push.
5. Green: push the TOP first, then the others top-down, each with an explicit lease on the SHA it replaces:
   `git -c credential.helper= -c "credential.helper=!gh auth git-credential" push --force-with-lease=<branch>:<origin tip now> origin <branch>:<branch>`
6. Update each PR body's first line with `gh pr edit <n> --body-file <file>` (keep the rest of the body): #103 "Stacked on #104, in the line main → #104 → #103 → #102 → #101 → #117 → #100."; likewise #102 on #103, #101 on #102, #117 on #101, and #100 "Stacked on #117, in the line main → #104 → #103 → #102 → #101 → #117 → #100. **The top: merge this one, with a merge commit, and the whole line lands.**" Remove any older "Stacked on"/"In the line" first line rather than adding a second.
7. Run `scripts/clear-ds-store.sh` again, then `git -C /workspace/byok worktree remove /workspace/byok-gp2-restack3`.

Report: per PR its new tip and whether it rebased clean or what you resolved (one line each); justify and size results with test counts; what you pushed and in what order; anything you stopped on. Never merge a PR, never force without a lease, never touch any other worktree.