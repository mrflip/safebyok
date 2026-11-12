# Releasing

How a release is made, for the Coach who makes one and for whoever works on the release workflow.
Agents never tag, publish, or change a version number: a thread contributes a changeset (PROCESS.md,
*Releases*). The checks only a person can make before a release are in `notes/release-checklist.md`.

* **Versions are semver, in lockstep.** The public packages are one `fixed` group in
  `.changeset/config.json`, so one bump moves them all. A test fails if a public package is left out
  of the group. Private packages, demos and `e2e/` are never versioned or released. Until 1.0, a minor
  bump may break the public surface, and its changeset says how. Between releases, main's version is
  the last one released: the next version is not known until release time.
* **The Version PR** is named for the release it makes ("Release 0.2.0: safebyok, ..."). It contains
  the version bumps, the CHANGELOG entries and the spent changesets, as one `rel:` commit with the same
  name. While changesets are waiting, the release workflow rebuilds it from main's tip each night
  (09:41 UTC), and whenever the Coach runs the workflow by hand on main (`gh workflow run release.yml`,
  or *Run workflow* on the Actions tab). A push to main leaves the Version PR as it is, so a series of
  merges does not rebuild it, and rerun CI over it, after each one. The PR belongs to the bot: nobody
  but the Coach rebases, edits or merges it. The release workflow writes it with the repository's
  GitHub App, so CI runs on it as on any PR: held while it is a draft, and run when it is labelled
  `ci` or marked ready.
* **It opens as a draft.** The Coach marks it ready when they mean to release it, after the by-hand
  checks in `notes/release-checklist.md` (real authenticators, real browsers, the Convex README walk,
  Supabase). A Version PR leaves out whatever merged after it was built, so if main has moved since,
  run the workflow by hand before marking it ready. A later run, including the nightly one, rebuilds
  it but leaves a ready PR ready. So reread what it contains before merging: new changesets may have
  joined it since it was last read.
* **Merging it is the release.** `release.yml` then checks the lockstep group, runs `pnpm justify`,
  packs each package whose version npm lacks, and stages each tarball. It tags each staged package
  (`safebyok@0.2.0`) and writes a GitHub release from its CHANGELOG, marking the core's release as the
  repository's latest. A prerelease version goes out under the `next` dist-tag. `pnpm changeset pre
  enter beta` starts prereleases, and `pnpm changeset pre exit` ends them.
* **Staged, not published.** The workflow's npm trusted publisher may only run `npm stage publish`.
  A version goes public when the Coach approves it with 2FA, on npmjs.com or with
  `npm stage approve <stage-id>` (`npm stage list` shows the ids). CI cannot approve its own staging.
  To mend a failed run, re-run its failed jobs or run the workflow by hand: steps already done are
  skipped. The nightly run never stages. A staged version nobody wants is rejected with
  `npm stage reject`, and its version number counts as burned until the Coach has tested otherwise.
