# Process

How work moves from an idea to a merged PR: threads, commits, pull requests, changesets, and what
may be added to the package. What CI checks is `notes/ci.md`; how a release is made,
`notes/releasing.md`. CLAUDE.md has the values these serve; STYLE.md has how the
code itself reads.

## Threads

Work goes in **threads**: one line of work, one branch, one PR. A branch is named
`YYYYMMDD-<label>`, the date it was cut and a short lowercase label (`20261014-scaffold`). Plans
and progress for a thread that takes more than a sitting go in `whiteboard/YYYYMMDD-<label>/`.

Within a thread you have standing permission to commit, push its branch, and open its PR without
asking. Commit at natural milestones: a set of related changes, with `pnpm justify` green. Not
mid-refactor, not on a timer.

### A worktree per thread

Other agents share the main checkout, so a thread is built in a worktree of its own beside it:
`scripts/cut-thread <label> [<base>]` makes `../byok-<label>` on a branch `YYYYMMDD-<label>`, cut
from `origin/main` or the base given, records that base as `branch.<branch>.sprintbase`, and runs
`pnpm install` there. It cuts with `--no-track`, as anyone cutting one by hand must: the
container's git pushes a branch to its upstream, and a branch tracking `origin/main` would push to
main. A thread built on another's unmerged work is cut from that branch's tip, and its PR says
"Stacked on #N". Push with
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
A set of open PRs is made one merge line by `/restacker` (`.claude/skills/restacker/SKILL.md`),
which rebases in a clone of its own, tests once at the tip, and force-pushes only under named leases.
Doc blocks are brought to STYLE.md's rules by the `documentarian` agent
(`.claude/agents/documentarian.md`), on a target a Coach names.
Comments, doc blocks and READMEs across a whole target are brought to plain English by `/gallantdocs`
(`.claude/skills/gallantdocs/SKILL.md`), a housekeeping pass that also harvests Goofus/Gallant pairs for the Coach to edit.

## The history we keep

* **History on main is semi-linear.** Every PR lands as one merge commit, and its commits keep
  the SHAs they had on the branch, so `git log --first-parent main` reads one line per PR and
  `git revert -m 1 <merge>` backs a PR out whole. Commits stay in straight lines because PRs
  are built as a stack: each branch is cut from the tip of the one below it (*A worktree per
  thread*), and the bottom one from `main`.
* **Never merge `main` into a branch**, and never use GitHub's "Update branch" in merge mode:
  rebase. A branch is rebased by hand, before it is queued, when it has fallen behind `main` and
  is not part of a stack; a rebase moves its SHAs, so it is `/restacker`'s work or the thread's own.
* **Mergify's queue lands each PR** (`.mergify.yml`): it tests the queued PRs together once, on a
  draft PR, then merges each PR at its own head, in the order they were queued. It never rebases
  or updates a branch. The Coach queues a stack by labeling its PRs `queue`, bottom first; an
  agent never adds that label. Once a PR is queued, push to it only to fix what the queue refused.
  `scripts/git-mergify` finds the stack and labels it in order (`--apply` to label; without it, a report).
* **A PR's page shows the commits between it and its base.** In a stack every PR has base `main`
  (the "Stacked on #N" line carries the order), so it lists the PRs below it until they merge,
  then only its own commits.
* **Every commit lands in main individually**, so each should pass `pnpm justify`. An
  intermediate red commit is allowed only when it isolates something, say a large mechanical
  change from the thoughtful repairs after it, and the PR says so.
* **Force-push only with an explicit lease**: `--force-with-lease=<branch>:<sha you rebased from>`,
  the branch's tip when you took it, never one fetched since: a lease read off a fresh fetch
  always matches, so it guards nothing. Never plain `--force`, and never a branch that isn't your
  thread's.
* **Never merge a PR, enable auto-merge, or queue one. The Coach merges.**
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
| `style`   | the `style-reviewer` agent's commits: its fixes of STYLE.md's hand-kept mechanical rules, one per rule family, wherever in the repository they fall |
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
* **Link each PR, branch or commit on first mention**, in chat, a PR body or a note:
  `[#12](https://github.com/mrflip/safebyok/pull/12)`.
* **Body**: what changed, in short paragraphs or bullets with **bold lead-ins**; a **Tests:**
  line naming what ran and the counts; "Stacked on #N" for an unmerged PR the branch stands on;
  and an *Open questions* list for what remains. Put those questions in chat and `human/` too: a
  PR description is easy to miss.
* A change to the public surface or to the stored format says so in its first line, and says
  what a consumer or an existing vault has to do about it.

What CI checks on a PR, and how Dependabot's PRs get their changesets, is `notes/ci.md`. What to
do with a Dependabot PR that fails, and what pushing to its branch costs, is
`notes/dependabot-prs.md`.

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

The Coach releases; agents never tag, publish, or change a version number. What a thread
contributes is a changeset.

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
  packages release in lockstep, and a line of README does not earn a bump of all seven. Until 1.0,
  a minor bump may break the public surface, and its changeset says how.
* **The packages version in lockstep**, one `fixed` group in `.changeset/config.json`. How a
  release is made -- the Version PR, staging, the Coach's approval -- is `notes/releasing.md`.

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

## Where things are written

* **`human/`** -- from agents, to Coaches: one file per entry (`human/README.md`).
* **`whiteboard/`** -- a thread's plans and progress, while it is open.
* **`winboard/`** -- a completed thread's folder, moved from `whiteboard/`, with its `human/`
  entries renamed `*-human.md` and a `*-resolution.md` saying how each of its gripes was settled.
* **`notes/security.md`** -- a decision a security reviewer should look at, in a sentence or two,
  dated. Add one when you make such a decision, in the same PR, through a subagent (the file's
  header says how): the file is long, and building needs none of it.
* **`notes/wontfix.md`** -- behaviour the package leaves undefined on purpose, dated, with the
  ruling that put it there.
* **Doc blocks** -- what a caller needs, and nothing about how the code came to be.
