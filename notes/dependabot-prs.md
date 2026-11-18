# Dependabot PRs with a failing check

What to do with a red `deps:` PR, and what pushing to its branch costs. How these PRs arrive and get
their changesets is in `notes/ci.md`, *Dependabot*. The seven-day rule on new releases is in
PROCESS.md, *Dependencies*.

## Pushing to a Dependabot branch is allowed

Push whatever gets the PR green. It changes who owns the branch:

* **The PR is yours from then on.** Once the branch has a commit that is not Dependabot's,
  Dependabot stops rebasing it, and `@dependabot rebase` does nothing. Maintain it like any branch
  you own.
* **CI treats it as an ordinary PR, so it needs a changeset.** Where the bump moves a public
  package's runtime dependencies, `dependabot-changeset.yml` has already written one; check that it
  still describes the PR. Otherwise (a devDependency, a tool, an image) add an empty one with
  `pnpm changeset --empty`, renamed `.changeset/dependabot-<PR>.md`, in the same push as your fix.
* **The seven-day rule still applies.** Do not use `minimumReleaseAgeExclude` to turn a red PR green.
  It is for a security fix that cannot wait, with its entry in `notes/security.md`.
* **Leave Dependabot's commit as it is.** Your changes go in commits of their own on top, so the
  bump and the fix read apart in history.
* **Look for the `queue` label before you push.** A queued PR takes a push only to fix what the
  queue refused (PROCESS.md, *The history we keep*).

## When it falls behind main

* **No commits of yours yet:** comment `@dependabot rebase`. If nothing happens within about a
  quarter of an hour, rebase it by hand, as below.
* **Commits of yours:** rebase by hand onto `origin/main`. On a lockfile conflict, take main's
  `pnpm-lock.yaml` and run `pnpm install --no-frozen-lockfile` to apply the bump again, rather than
  merging the lockfile by hand. Run `pnpm justify` at the tip, then force-push with a lease on the
  sha you rebased from. Dependabot's commit keeps its author.

## First, find the cause

Read the failing job's log, then decide which of these it is:

1. **The bump needs a change of ours**: an API that changed, a stricter type, a behaviour a test
   pinned, or a pin that must move in two places (`e2e/compose.yaml`'s Postgres image and
   `ci.yml`'s, say). Push the fix to the PR in its own commit, with a fitting prefix and a message
   saying why. Keep it small. If it grows past a sitting, close the PR and make the migration a
   thread of its own: a large hand-built branch under a bot's title is hard to review.
2. **The failure does not depend on the bump**: a latent bug the update exposed. A fix of a few
   lines rides along on the PR, as in case 1. A larger one goes to `main` in its own PR, and then
   `@dependabot rebase`.
3. **One package in a group is the culprit.** Bisect the lockfile diff to find it. If the fix is a
   code change, treat it as case 1. If the upstream package is broken, add an `ignore` entry for it
   in `.github/dependabot.yml` with a comment saying why, or comment `@dependabot ignore this
   dependency`. The rest of the group comes back without it.
4. **It is flaky.** Re-run the job and push nothing.

Some tests pin a dependency's version on purpose, so that a bump fails and someone checks. One
example pins `safebyok-convex`'s fake deployment to the Convex release it was written against. Do the
check the test's comment names (for Convex, check the fake against the new client's messages, for
instance by diffing `dist/esm/browser/` and `values/` between the two releases from `npm pack`).
Then move the pin, and the version the test's comment and title name. Do not loosen the pin to make
it pass.

## Avoid

* Pinning or ignoring a dependency just to get green, without a comment saying why.
* A fix commit that mixes a dependency change with unrelated work.
