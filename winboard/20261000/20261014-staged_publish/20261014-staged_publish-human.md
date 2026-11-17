# 2026-10-14: Staged publishing and `pnpm bump` -- three checks only you can make

[#11](https://github.com/mrflip/safebyok/pull/11) is rebased onto main (after #12), CI is green and
it is mergeable. The release workflow now runs `npm stage publish` and `pnpm bump` changes the
version. What is left needs a real release or the npm side:

* **Does a staged version keep its `--tag` on approval?** The npm docs I found don't say. Check on
  the first prerelease (`pnpm bump prerelease --preid beta`, which should land under `next`).
* **Does provenance survive staging and approval?** Look at the package page after the first
  approval.
* **The trusted publisher's first publish must happen within 2 days** of saving its configuration,
  and npm does not validate the configuration when it is saved.
* **"Allow npm dist-tag" is on, but nothing uses it.** The npm bundled with Node 24.21.0 (11.19.0)
  is older than the 11.21.0 that dist-tag over OIDC needs, so the release workflow now installs
  npm 12.2.0, the current release (it also has `npm stage`, and supports Node 24.21). The pin is
  exact and Dependabot will not move it. This is untested until a real release.
* **Unknown:** whether a rejected stage uses up its version number.

Answered since the PR was opened: the GitHub `npm` environment's required reviewers are off, so
the 2FA approval is the only gate; the rename conflict is resolved.
