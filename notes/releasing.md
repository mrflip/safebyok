# Releasing

How a release is made, for the Coach who makes one and whoever works on the release workflow.
Agents never tag, publish, or change a version number: a thread contributes a changeset
(PROCESS.md, *Releases*). The passes only a person can make, before a release, are
`notes/release-checklist.md`.

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
