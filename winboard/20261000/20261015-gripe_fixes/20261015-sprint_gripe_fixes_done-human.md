# 2026-10-15: Sprint gripe_fixes done -- eight PRs over your FIX marks, restacked into one merge line

The sprint worked through every gripe you marked FIX in `winboard/20261015-gripes/20261015-gripes.md`:

- the KDF configurations and their bounds;
- VaultDB and the other entrypoints' validation, with a full survey;
- the React dialog's copy and errors;
- CI and tooling: the npm hash pin, the Dependabot changeset gate, a faster `justify`;
- the security notes and VOCABULARY;
- thin tests, then shared test helpers;
- a 100-column comment rule.

Everything is stacked on the second_harvest merge stack ([#66](https://github.com/mrflip/safebyok/pull/66) on top), because that stack rewrites most of what these threads touch. Every thread was reviewed except #69, which is documents only. One fix was left out, the demo over Convex: it needs a deployment and an auth story that are yours to choose. The gripes list now notes each FIX entry's PR. Your NOTED, *fixed* and REPLY entries moved under *Addressed*. NOTYET and *ragebait* moved under *Deferred by design*.

## The PRs, in the order to merge them

*Restacked after the sprint, at the Coach's word*: one linear merge line, each PR's base still `main`, so merging the top, [#82](https://github.com/mrflip/safebyok/pull/82), merges them all. Peers went biggest first. The line sits on `main` itself: [#66](https://github.com/mrflip/safebyok/pull/66)'s commits reached `main` under other SHAs through #63's merge, so #66 has nothing left to merge, though its PR is still open.

1. [#70](https://github.com/mrflip/safebyok/pull/70): validation at every entrypoint, plus the survey. Stacked on `main`.
2. [#75](https://github.com/mrflip/safebyok/pull/75): thin tests. Stacked on #70.
3. [#80](https://github.com/mrflip/safebyok/pull/80): shared test helpers. Stacked on #75.
4. [#68](https://github.com/mrflip/safebyok/pull/68): `argon2idDeriver(spec)`. A deriver wearing the supplied label must carry its parameters, and settings that cannot run are refused. Stacked on #80. **Breaking**: a host deriver labelled `argon2id_web_v1` without the spec's parameters is refused at open. Its restack resolved additive conflicts with #70, moved its tests onto `TH.expectRefusal`, bumped the size budget (approved) and added the KDF TODO.
5. [#72](https://github.com/mrflip/safebyok/pull/72): CI and tooling. Stacked on #68.
6. [#67](https://github.com/mrflip/safebyok/pull/67): the React dialog. It states the real unlock window and shows an unlock's conditions in place. Stacked on #72.
7. [#69](https://github.com/mrflip/safebyok/pull/69): the security notes and VOCABULARY, checked against the code. Stacked on #67.
8. [#82](https://github.com/mrflip/safebyok/pull/82): these documents. Stacked on #69; the top.

[#81](https://github.com/mrflip/safebyok/pull/81), the comment width rule, stays out of the line: the Coach redoes it, from its recipe, after this line and big_feats' merge.

## YOLO decisions

- Every thread stacked on #66's tip, not `origin/main`.
- The sprint branch carries the gripes list, committed from your uncommitted working copy on `20261015-gripes`. That local branch is now superseded. Its two `TODO.md` lines were not carried; the list says they can be dropped.
- "FIXd" on the comment-width entry was read as FIX. "pretending" was reworded despite an earlier sweep calling it ordinary English.
- VERIFY FIXED (the root scripts) was closed as verified under dash and `bash --posix`.
- Thread 6 was re-stacked on #70, because both rewrote the same Convex test.
- Thread 8 started early, because waiting bought nothing on its base.

## Open questions, gathered

**Needs your word before or at merge**

- **`openVault` size budget**: settled. The Coach approved a bump; #68's restack raised `openVault` to 17 kB (16.61 kB used) and everything to 24.5 kB (24.24 kB used).
- **Leftover directories**: `/workspace/byok-test_helpers` and `/workspace/byok-comment_width` are unregistered and fully pushed, but still on disk. The permission check refused deleting them, and the orchestrator didn't work round it.

**Design calls (none block a merge)**

- **KDF (#68)**:
  - ~~Add RFC 9106's second option as a second supplied configuration?~~ Now a TODO.md entry, at the Coach's word: provide built-as-a-whole recommended KDFs, and functions to roll your own.
  - Reserve a label namespace?
  - A hand-built deriver under a host label that declares Argon2id gets only the generic salt check at open, so an unrunnable spec fails at `unlock()` with no `kind`. A follow-up could run the Argon2id schema whenever `algorithm === 'argon2id'`.
  - `KeyDeriver` gives every deriver Argon2id's optional fields; look at that before 1.0.
- **Validation (#70)**:
  - Is the reframed allowance enough, or do you want a stricter accounting? That would lower capacity.
  - `user_id` has no length bound.
  - Should `erase()` tolerate a box that reads `corrupt_record`?
  - Should `SafebyokComponent.api` check `getUserId` at load?
  - `openVault` duck-types `vaultDB`.
- **Convex errors (#75)**: should `convexVaultDB` keep Convex's validator error as a refusal's `cause`? On a dev deployment it quotes the refused arguments. The recommendation is to keep it.
- **React dialog (#67)**: a misuse unlock never settles the `withUnlockedVault` promise. A core accessor for the unlock window would end the dialog's duplicated default.
- **CI (#72)**:
  - A Dependabot PR that moves a runtime dependency fails CI until you push a changeset to it.
  - The gate keys on the PR's author.
  - The Version PR's skip trusts the `changeset-release/` branch name; this predates the sprint.
- **Tests (#80)**:
  - Is the `expect*` lint convention acceptable?
  - `tallyWatches`, now public, can let a double close hide a leaked watch.
- **Comment width (#81)**: hold comments trailing code to 100 columns too? That would need a code-length rule.

**Process**

- Your REPLY that sprint docs ride with the first thread changes `/sprint`'s own mechanics. This sprint ran as the skill stands, so tell the orchestrator how you want it.
- During the sprint, two reviewers hit refused commands. Thread 6's reviewer made the same edit by hand instead (`ed955db`); the edit is sound. Thread 7's worker stopped at the refusal, as it should.
