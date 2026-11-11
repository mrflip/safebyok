# Dependabot PRs with a failing check

What to do with a red `deps:` PR, and what pushing to its branch costs. How these PRs arrive and get
their changesets is in `notes/ci.md`, *Dependabot*. The seven-day rule on new releases is in
PROCESS.md, *Dependencies*.

## Pushing to a Dependabot branch is allowed

Nothing forbids it, but it changes who owns the branch:

* **Dependabot stops managing it.** Once the branch has a commit that is not Dependabot's,
  Dependabot stops rebasing it, and `@dependabot rebase` does nothing. From then on the PR is
  maintained by hand, and rebased by hand like any other (PROCESS.md, *The history we keep*).
* **CI treats it as an ordinary PR.** The changeset rule is the one in `notes/ci.md`: if the PR moves
  a public package's runtime dependencies, `dependabot-changeset.yml` has already written the
  changeset once, and will not write it again. After a push that changes what the PR does, check
  that the changeset still describes it.
* **The seven-day rule still applies.** Do not use `minimumReleaseAgeExclude` to turn a red PR green.
  It is for a security fix that cannot wait, with its entry in `notes/security.md`.
* **Never force-push over Dependabot's commits.** Add commits on top. Rebasing is Dependabot's job.

## First, find the cause

Read the failing job's log, then decide which of these it is:

1. **The bump breaks our code**: an API that changed, a stricter type, or a behaviour a test pinned.
   Push the fix to the PR in its own commit, with a `deps:` or other fitting prefix and a message
   saying why. Keep it small. If it grows past a sitting, close the PR and make the migration a
   thread of its own: a large hand-built branch under a bot's title is hard to review.
2. **The failure does not depend on the bump**: a flaky test, or a latent bug the update exposed.
   Fix it on `main` in its own PR, then comment `@dependabot rebase`. The PR stays purely
   Dependabot's, and the fix has its own place in history.
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
