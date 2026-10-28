# Dependabot PRs with a failing check

What to do with a `deps:` PR that is red, and what pushing to its branch costs. How these PRs
arrive, and how they get their changesets, is `notes/ci.md`, *Dependabot*; the seven-day rule on
new releases is PROCESS.md, *Dependencies*.

## Pushing to a Dependabot branch is allowed

Nothing forbids it, but it changes who owns the branch:

* **Dependabot stops managing it.** Once a commit that is not Dependabot's is on the branch,
  Dependabot stops rebasing it, and `@dependabot rebase` does nothing. The PR is maintained by
  hand from then on, and Mergify's queue rebases it like any other (PROCESS.md, *The history we
  keep*).
* **CI reads it as an ordinary PR.** The changeset is `notes/ci.md`'s: when the PR moves a public
  package's runtime dependencies, `dependabot-changeset.yml` has already written it, once, and
  will not again. After a push that changes what the PR does, check that changeset still says it.
* **The seven-day rule still holds.** Do not use `minimumReleaseAgeExclude` to turn a red PR green.
  That is for a security fix that cannot wait, with its entry in `notes/security.md`.
* **Never force-push over Dependabot's commits.** Add commits on top; a rebase is Dependabot's,
  or Mergify's.

## First, find the cause

Read the failing job's log, then decide which of these it is:

1. **The bump breaks our code**: an API that changed, a stricter type, a behaviour a test pinned.
   Push the fix to the PR, in its own commit with a `deps:` or other fitting prefix and a message
   saying why. Keep it small. If it grows past a sitting, close the PR and make the migration a
   thread of its own: a large hand-built branch under a bot's title is hard to review.
2. **The failure does not depend on the bump**: a flaky test, or a latent bug the update
   exposed. Fix it on `main` in its own PR, then `@dependabot rebase`. The PR stays purely
   Dependabot's and the fix has its own place in history.
3. **One package in a group is the culprit.** Bisect the lockfile diff to find it. If the fix is a
   code change, treat it as case 1. If upstream is what is broken, add an `ignore` entry for that
   package in `.github/dependabot.yml` with a comment saying why, or `@dependabot ignore this
   dependency`; the rest of the group comes back without it.
4. **It is flaky.** Re-run the job and push nothing.

A test that pins a dependency's version on purpose, such as the one that holds `safebyok-convex`'s
fake to the Convex release it was written against, fails a bump so that someone checks. Do the
check the test's comment names (for Convex, diff `dist/esm/browser/` and `values/` between the two
releases from `npm pack`), then move the pin and the version its doc block names. Do not loosen the
pin to make it pass.

## Avoid

* Pinning or ignoring a dependency just to get green, without a comment saying why.
* A fix commit that mixes a dependency change with unrelated work.
