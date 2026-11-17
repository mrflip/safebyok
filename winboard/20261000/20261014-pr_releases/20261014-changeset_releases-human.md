# 2026-10-14: Releases go through changesets -- what is left before the first release, and what it will prove

[#22](https://github.com/mrflip/safebyok/pull/22) (thread 3 of sprint pr_releases), rebased onto
main after [#15](https://github.com/mrflip/safebyok/pull/15) and
[#16](https://github.com/mrflip/safebyok/pull/16) merged.

**What landed.** Every PR that changes a public package carries a changeset (CI asks; `pnpm
changeset --empty` for none). Every push to main runs `release.yml`: while changesets wait, it
keeps one Version PR, "Version the packages for release", rebuilt from main's tip; once that is
merged, it justifies, packs each package npm lacks with pnpm, stages each tarball
(`scripts/release.ts`, since changesets cannot stage), and the changesets action tags each one
(`safebyok@0.1.0`, `safebyok-react@0.1.0`) and writes its GitHub release. `safebyok` and
`safebyok-react` version in lockstep; a test refuses a public package left out. `pnpm bump` and
bumpp are gone. PROCESS.md, *Releases*, has the cycle.

**Done (2026-10-15):** "Allow GitHub Actions to create and approve pull requests" is on, so the
`version` job can open the Version PR; and the "versions are frozen" tag ruleset now covers
`refs/tags/safebyok*@*` beside `refs/tags/v*`, so the per-package tags are frozen too.

**Before the first release, only you can:**

1. **Write the first changeset**: `pnpm changeset`, pick both packages, `minor` gives `0.1.0` from
   `0.0.0`. No branch of this sprint holds one (#22 carries only an empty one, which bumps
   nothing).
2. **Close and reopen the Version PR before merging it.** A PR opened by the workflow's token runs
   no workflows, so its required checks (CI and CodeQL) would wait forever; a human reopening it
   starts them. The lasting fix is a GitHub App token for the `version` job: say if you want it.
3. Worth doing: limit the `npm` environment to the `main` branch (today any branch may use it).

**What only the first release can verify:**

1. That npm's trusted publisher accepts the rewritten workflow unchanged: same file, same `npm`
   environment, now on `push`, staging from the `publish` job. If it refuses, the fix is on
   npmjs.com.
2. What npm says when asked to stage a version already staged. The script counts a refusal
   saying "previously published" as done; if npm words it otherwise, a re-run after a partial
   failure reports that package as failed (readable, but red). `npm stage list` cannot help in CI:
   npm's trust tokens may not run `npm stage` subcommands. A later push to main never asks npm
   again: a version whose tag names an earlier commit is skipped.
3. Whether a version rejected with `npm stage reject` can be staged again. Until tested, PROCESS.md
   says its number is burned.
4. Whether to give the `npm` environment required reviewers: it has none today, so 2FA approval
   is the only gate after the merge.
5. Carried from the staged-publish entry: that provenance survives staging a tarball and
   approving it, and that the dist-tag survives approval.

**Until the first release**, every push to main runs the `pack` and `publish` jobs: `safebyok-react`
at `0.0.0` is not on npm, so changesets offers it, and the script skips `0.0.0` as a placeholder.
Green, but about two minutes of runner time a push.
