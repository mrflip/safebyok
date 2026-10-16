# Process

How work moves from an idea to a published version: threads, commits, pull requests, releases,
and what may be added to the package. CLAUDE.md has the values these serve; STYLE.md has how the
code itself reads.

## Threads

Work goes in **threads**: one line of work, one branch, one PR. A branch is named
`YYYYMMDD-<label>`, the date it was cut and a short lowercase label (`20261014-scaffold`). Plans
and progress for a thread that takes more than a sitting go in `whiteboard/YYYYMMDD-<label>/`.

Within a thread you have standing permission to commit, push its branch, and open its PR without
asking. Commit at natural milestones: a set of related changes, with `pnpm justify` green. Not
mid-refactor, not on a timer.

### A worktree per thread

Other agents share the main checkout, so a thread is built in a worktree of its own beside it,
`../byok-<label>`. From the main checkout:

```sh
git fetch origin
git worktree add --no-track -b YYYYMMDD-<label> ../byok-<label> origin/main
git -C ../byok-<label> config branch.YYYYMMDD-<label>.remote origin
git -C ../byok-<label> config branch.YYYYMMDD-<label>.merge refs/heads/YYYYMMDD-<label>
cd ../byok-<label> && pnpm install
```

`--no-track` matters: the container's git pushes a branch to its upstream, and a branch cut
tracking `origin/main` would push to main. A thread built on another's unmerged work is cut from
that branch's tip instead of `origin/main`, and its PR says "Stacked on #N". Push with
`git -c credential.helper= -c credential.helper='!gh auth git-credential' push`. Once the PR is
filed, `git worktree remove ../byok-<label>`; the branch stays for the PR. Once it has merged,
`/branch-sweep`, run when the Coach asks, has `scripts/git-survey.sh` tag the branch
`closed/<branch>` and point it at its merged head, and remove the thread's worktree if it was
left behind clean and idle (`notes/housekeeping.md`): the one place an agent moves a branch or
removes a worktree that is not its own.

An ordered series of threads issued at once is a **sprint**, run by `/sprint`
(`.claude/skills/sprint/SKILL.md`) through `thread-worker` and `thread-reviewer` agents.
Open questions too many for chat go to a doc's **Open Matters** tab, run by `/turbochat`
(`.claude/skills/turbochat/SKILL.md`): the Coach flips a row's state, and agents act on that.

## The history we keep

* **History on main is semi-linear.** Every PR branch is rebased onto the tip of `main` and lands
  as one merge commit, so `git log --first-parent main` reads one line per PR and
  `git revert -m 1 <merge>` backs a PR out whole.
* **Never merge `main` into a branch**, and never use GitHub's "Update branch" in merge mode:
  rebase. CI rejects a PR branch holding a merge commit.
* **Every commit lands in main individually**, so each should pass `pnpm justify`. An
  intermediate red commit is allowed only when it isolates something, say a large mechanical
  change from the thoughtful repairs after it, and the PR says so.
* **Force-push only with an explicit lease**: `--force-with-lease=<branch>:<sha you expect>`.
  Never plain `--force`, and never a branch that isn't your thread's.
* **Never merge a PR or enable auto-merge. The Coach merges.**
* Before a command that throws work away (`reset --hard`, `restore`, `clean`, `branch -D`), make
  what it would discard reachable first: commit it or put a branch on it. If you can't tell what
  it would discard, stop and ask.

### Rebase conflicts

Fix the straightforward ones yourself and carry on: the lockfile (take the base's, then
`pnpm install`), edits side by side that don't contradict, docs and import lists, tests the base
broke mechanically. Stop and ask when both sides changed the same logic, when the base changed
something the thread depends on, or when resolving would drop a change from either side. Before a
hairy rebase, tag the tip (`git tag <branch>-prerebase <branch>`, kept local) so there is a named
place to rewind to.

## Commit messages

One prefix, lowercase, a colon, a space, and a plain-language sentence saying what changed. The
prefix names the part of the package the commit is about, never the kind of change (no `feat:`,
`fix:`, `chore:`), and never two.


| Prefix    | What it covers                                                                                                                         |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `crypto`  | key derivation, encryption, key wrapping, randomness: anything a cryptographer would review. Takes precedence over every other prefix. |
| `vault`   | the vault's lifecycle and state: create, unlock, lock, refresh, rotate, subscribe                                                      |
| `storage` | the storage interfaces and their adapters, in the core and in the `safebyok-<store>` packages, such as `safebyok-postgres`             |
| `api`     | the public surface: exports, entry points, exported types, errors                                                                      |
| `client`  | the companion client bindings under `packages/`, such as `safebyok-react`                                                              |
| `tools`   | build, lint, test and TypeScript configuration, CI and release workflows                                                               |
| `deps`    | adding, removing or bumping a dependency, and the lockfile. Where reasonable, commit the package change independently |
| `docs`    | `README.md`, `PROCESS.md`, `STYLE.md`, `notes/`, `CLAUDE.md` and other directives to agents   |
| `demo`    | the playground apps under `demos/`                                                                                                     |
| `plan`    | `whiteboard/` plans and `human/` entries                                                                                               |
| `rel`     | the Version PR's one commit, made by the release workflow: version bumps, CHANGELOG entries, spent changesets. Never typed by hand       |
| `tests`   | tests and fixtures, when the tests themselves are the work                                                                             |

Tests and notes that ride along with a change take its prefix

## Pull requests

File against `main`, as a draft while you work. *Significant* questions -- ones whose answer
would change the code in the PR -- are asked in chat, and lead the PR's body until answered.

* **Draft while you work.** Open the PR as a draft (`gh pr create --draft`) when you first push
  the branch, and push to it as the work goes. Before you report back -- to the Coach, or in a
  sprint to the orchestrator -- take it out of draft (`gh pr ready`), whatever the report says.
  It stays out of draft from then on: later fixes are pushed to it as it stands.
* **Title**: plain language, saying what changed.
* **Body**: what changed, in short paragraphs or bullets with **bold lead-ins**; a **Tests:**
  line naming what ran and the counts; "Stacked on #N" for an unmerged PR the branch stands on;
  and an *Open questions* list for what remains. Put those questions in chat and `human/` too: a
  PR description is easy to miss.
* A change to the public surface or to the stored format says so in its first line, and says
  what a consumer or an existing vault has to do about it.

CI runs on every PR, over the root and every workspace package: `lint-typecheck` (lint, typecheck,
no merge commits, a changeset, and `actionlint` over the workflows) and `test-build` (tests with
coverage, which builds every package with its package checks, then the size budgets) must pass;
`node-compat` runs the tests on Node 22, the platform floor, which must pass too, and on the
newest Node, which reports. CodeQL scans the code and the workflows, and a finding shows on the
PR. Dependabot opens grouped `deps:` PRs weekly; they get the same review as any other. One
whose every commit is Dependabot's is asked for a changeset only when it moves a public package's
runtime dependencies, as `scripts/runtime-deps.ts` reads them (`dependencies`, `peerDependencies`,
`optionalDependencies`, `peerDependenciesMeta`, `bundledDependencies`, a package added, removed
or made private): `.github/workflows/dependabot-changeset.yml` writes it, a `patch`
named `.changeset/dependabot-<n>.md`, and pushes it with the release App's token, so CI runs
again on it. A devDependency or lockfile bump needs none. A Dependabot branch with a commit of
anyone else's on it is a PR like any other, and carries a changeset like one.

## Packages

The published packages live in `packages/`: `safebyok`, the core, and its companions, each named
for what it plugs in. A storage adapter is `safebyok-<store>` (`safebyok-convex`,
`safebyok-indexeddb`, `safebyok-postgres`, `safebyok-graphql`), a framework binding
`safebyok-<framework>` (`safebyok-react`), and anything else is named for what it supplies
(`safebyok-fastkey`, a key deriver). A new one copies an existing package's packaging -- its
own `eslint.config.mjs` cut from the core's, a README, a changeset -- takes `safebyok` as a peer
dependency, so a `VaultError` is one class across them, and joins the `fixed` group in
`.changeset/config.json` (a test refuses a public package left out). `safebyok-indexeddb`'s
README is written as the template for a storage adapter.

## Releases

The Coach releases; agents never tag, publish, or change a version number. Changesets keeps the
numbers and the CHANGELOGs; `.github/workflows/release.yml` does the rest.

* **A changeset** is a short file in `.changeset/`, written with `pnpm changeset`: which packages
  it bumps, by how much, and a sentence or two for the CHANGELOG. It is named for the thread,
  `.changeset/YYYYMMDD-<label>.md` (a second one on the thread gets `-2`, and so on):
  `scripts/changeset.ts` runs the changesets CLI and renames what it writes. The CLI asks at a
  terminal; an agent with none writes it in one line, `pnpm changeset --package safebyok
  --package safebyok-react --bump minor --message "What a host sees."`. A PR that changes a
  public package carries one, or CI fails it; one that needs no release (tooling, tests, docs)
  carries an empty one, `pnpm changeset --empty`. Agents write changesets: they state intent, not a version.
* **The level, before 1.0**: `minor` for anything that touches a stored shape or an exported name
  (an interface a host may implement, or fake, counts: adding to it breaks the host's object);
  `patch` for any other change that ships (a fix, a runtime-dependency bump); an empty changeset
  for what ships nothing. A README-only change to a published package takes an empty one too: the
  packages release in lockstep, and a line of README does not earn a bump of all seven.
* **Versions are semver, in lockstep.** The public packages are one `fixed` group in
  `.changeset/config.json`, so one bump moves them all; a test refuses a public package left out
  of it. Private packages, demos and `e2e/` are never versioned or released. Until 1.0, a minor bump may
  break the public surface, and its changeset says how. Between releases, main's version is the
  last one released: the next is not knowable until release time.
* **The Version PR**, named for the release it makes ("Release 0.2.0: safebyok, ..."), is rebuilt
  from main's tip by every push to main while changesets wait: the bumps, the CHANGELOG entries
  and the spent changesets, as one `rel:` commit named the same way. It is the bot's: nobody
  rebases, edits or merges it but the Coach. The release workflow writes it with the repository's
  GitHub App, so CI runs on it as on any PR.
* **It opens as a draft.** The Coach marks it ready when they mean to release it, after the
  by-hand passes in `notes/release-checklist.md` (real authenticators, real browsers, the Convex
  README walk, Supabase). A later push to main rebuilds it but leaves a ready PR ready, so before
  merging, reread what it holds: new changesets may have joined it since it was read.
* **Merging it is the release.** `release.yml` then checks the lockstep group, runs
  `pnpm justify`, packs each package whose version npm lacks, stages each tarball, and tags each
  package staged (`safebyok@0.2.0`) with a GitHub release from its CHANGELOG, the core's marked
  the repository's latest. A prerelease
  version goes out under the `next` dist-tag; `pnpm changeset pre enter beta` starts prereleases
  and `pnpm changeset pre exit` ends them.
* **Staged, not published.** The workflow's npm trusted publisher may only `npm stage publish`.
  A version goes public when the Coach approves it with 2FA, on npmjs.com or with
  `npm stage approve <stage-id>` (`npm stage list` shows the ids); CI cannot approve its own
  staging. A failed run is mended by re-running its failed jobs: what is done is skipped. A staged
  version nobody wants is `npm stage reject`ed, and its number counts as burned until the Coach
  has tested otherwise.

## Dependencies

Everything we build with is chosen against the same test: **boring** (proven, widely adopted),
**agent-friendly** (old enough to be in an agent's training), **ergonomic**, **zero-ops**, and
offering a **disciplined interface**.

* **Runtime dependencies** (`dependencies`, `peerDependencies`) ship to every app that installs
  us. Propose one in chat, with what it replaces and how widely it is used, before adding it.
* **Small utilities are where this discipline earns its keep.** Serialization, comparison,
  cloning, memoizing, debouncing: each looks like a dozen obvious lines, and each has a boring,
  battle-tested package (often with millions of weekly downloads) whose edge cases are already
  somebody else's scar tissue. "Too small to be worth a dependency" is the moment to search npm,
  not the moment to skip it; propose the package you find, and hand-roll only if the Coach turns
  it down.
* **Development dependencies** that are plainly the boring answer may simply be installed: say so
  afterwards.
* Version numbers and release status drift. Before pinning anything, check the current release;
  don't trust a recalled version number, including one recalled by an agent.
* **Runs everywhere**: accessible from React Native, React, Next.js, Nuxt, node, bun.
* **Nothing is installed until it is seven days old.** `pnpm-workspace.yaml` sets
  `minimumReleaseAge: 10080` (minutes) with `minimumReleaseAgeStrict: true`: no version of
  anything, transitive dependencies included, is resolved or installed younger than that, and an
  install that could only be satisfied by one fails rather than falling back. A lockfile holding
  such a version fails its frozen install too. A range's floor is therefore the newest release
  that has aged: raise it as releases mature, not the day they appear. Dependabot's `cooldown`
  matches (`.github/dependabot.yml`); security updates ignore it, and then the rule below applies.
* **A hot release is the one exception, and is pinned more tightly, not less.** When a fix cannot
  wait for its seventh day, pin that exact version (no range, no caret), and exempt it in
  `minimumReleaseAgeExclude` by name and exact version (`pkg@1.2.3`; never a bare name, a glob or
  a version list that outlives the need). Never an exclusion for convenience or to get a newer
  feature sooner. The same day, add an entry to `notes/security.md` naming the package, the exact
  version, why it could not wait, and the date it passes seven days; say so in the PR. Once it has
  aged, delete the exclusion and the exact pin in one commit, returning to a range. We would
  rather meet a hundred bugs in a conservative release than one vulnerability in a fresh one.

The toolchain: TypeScript, Vitest, ESLint, tsdown.

## Size budgets

`.size-limit.json` holds one budget per import shape of the built packages, checked by `pnpm size`
(`pnpm justify` and CI run it after the build). JSON has no comments, so the rule for setting a budget lives here.
size-limit's `kB` is 1000 bytes, and it measures minified and brotlied.

1. **Start from the measure** (`pnpm size`, or `npx size-limit --json` for exact bytes).
2. **Add the room.** A bundle of 5 kB or more gets **+3 kB**; one under 5 kB gets **+50%**, and at
   least +1 kB, so a small bundle is not given more room than its own size.
3. **Round up to a round number**: two significant figures, never down (2.3 kB of measure is
   3.5 kB of budget; 22.15 kB is 23 kB; 26.83 kB is 30 kB). Round numbers keep a stack of PRs
   from fighting over digits: a budget of 2_431 bytes is a conflict waiting for the next
   thread, and 2_500 is not.

The rule sets a budget; it may lower one as well as raise it. A bundle that shrank gets the
smaller budget the rule gives, so a budget never sits looser than its measure earns.

Only the ESM build is measured: it is what a bundler reads and tree-shakes, and the CommonJS
build is for Node hosts, where bytes shipped to a browser are not the concern. A package's
peers (`safebyok`, `zod`, `react`) are left out of its own entry's measure with `ignore`: the
host has them already, and the budget is for what the package adds. `pnpm size` builds the
measured packages once and measures them; `pnpm size:check` measures what is already built,
which is what `pnpm justify` does after its tests have built everything. size-limit itself runs
on Node `^22.19`, `^24.5` or `>=26`, narrower than our `engines`; CI runs it on the pinned Node.

A sprint's orchestrator guesses the target up front and has the first thread set it, so the
stacked PRs agree (`.claude/skills/sprint/SKILL.md`); a late thread lowers the budgets to this
rule once the sprint's sizes are known. Anyone else raising a budget follows the same rule, and
says in the PR why the bundle grew.

## Where things are written

* **`human/`** -- from agents, to Coaches: one file per entry (`human/README.md`).
* **`whiteboard/`** -- a thread's plans and progress, while it is open.
* **`winboard/`** -- a finished thread's folder, moved from `whiteboard/`, with its `human/`
  entries renamed `*-human.md` and a `*-resolution.md` saying how each of its gripes was settled.
* **`notes/security.md`** -- a decision a security reviewer should look at, in a sentence or two,
  dated. Add one when you make such a decision, in the same PR.
* **`notes/wontfix.md`** -- behaviour the package leaves undefined on purpose, dated, with the
  ruling that put it there.
* **Doc blocks** -- what a caller needs, and nothing about how the code came to be.
