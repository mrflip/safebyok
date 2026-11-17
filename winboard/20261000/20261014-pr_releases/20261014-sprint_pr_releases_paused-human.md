# 2026-10-14: Sprint pr_releases paused -- thread 3 waits on one uncommitted review fix

**Filed**

* Thread 1, [#15](https://github.com/mrflip/safebyok/pull/15): `safebyok-react` is publishable; tests run per package and whole-repo. Review clean.
* Thread 2, [#16](https://github.com/mrflip/safebyok/pull/16), stacked on #15: the core moves to `packages/safebyok`; root scripts cover every package. Review clean.

**Waiting, unfiled: thread 3** (`20261014-changeset_releases`, stacked on #16), in `/workspace/byok-changeset_releases`, HEAD `ef5098a`, six commits, nothing pushed. Built, justify green, reviewed. The reviewer made one fix and proved it, then the permission system denied its `git commit`, so the worktree holds that fix uncommitted in `scripts/release.ts` and `tests/scripts/release.test.ts`. The orchestrator did not commit it on the reviewer's behalf.

**What would resume it** (your word on either):

1. Commit the two files yourself, or tell me to (suggested message: `tools: the stage script reports a release it could not look up or read as failed and goes on to the next, as its doc block promises`, with the Co-Authored-By trailer), or tell me to discard the fix (then the PR files as built, with the finding listed).
2. Then the thread-3 worker is resumed to file it ("Stacked on #16"), the review comment is posted, and the sprint wraps up.

**For you before the first release** (from thread 3's `winboard/20261014-pr_releases/20261014-changeset_releases-human.md`, on its branch): enable "Allow GitHub Actions to create and approve pull requests"; write the first changeset; widen the tag ruleset from `v*` to `safebyok*@*` (thread 3 tags per package, not `v<version>`); decide whether the Version PR needs an App token so its required CI runs; optionally restrict the `npm` environment to `main`.

**Other open items**

* Two flaky tests, same cause (`vault.test.ts` and `crypto.test.ts` "altered ciphertext", ~1/64): their own thread.
* Make `packages` CI, and the demo, required checks? (`test-build` now runs the demo's tests.)
* A vite dev server from thread 1's removed worktree still runs on port 5199 (pids 281403, 281454).
* The demo passphrase dialog was never clicked through (no browser in the sandbox).
* The preplan branch `20261014-pr_based_releases` still holds the preplan, a `rel` row and TODO edits; a copy of the preplan is in this sprint's directory.
