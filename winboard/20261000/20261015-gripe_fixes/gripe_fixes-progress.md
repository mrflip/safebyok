# Sprint gripe_fixes -- progress

Newer than the plan wherever they disagree. Each thread's own notes are in its
`thread-<N>-<label>.md`, on its own branch.

## Status

| # | Thread             | Base                  | Status  |
| - | ------------------ | --------------------- | ------- |
| 1 | kdf_configs        | #80 (restacked)       | filed [#68](https://github.com/mrflip/safebyok/pull/68) |
| 2 | vaultdb_validation | `main` (restacked)    | filed [#70](https://github.com/mrflip/safebyok/pull/70) |
| 3 | react_dialog       | #72 (restacked)       | filed [#67](https://github.com/mrflip/safebyok/pull/67) |
| 4 | ci_tooling         | #68 (restacked)       | filed [#72](https://github.com/mrflip/safebyok/pull/72) |
| 5 | docs_refresh       | #67 (restacked)       | filed [#69](https://github.com/mrflip/safebyok/pull/69) (no review: documents only) |
| 6 | thin_tests         | #70 (restacked)       | filed [#75](https://github.com/mrflip/safebyok/pull/75) |
| 7 | test_helpers       | #75 (restacked)       | filed [#80](https://github.com/mrflip/safebyok/pull/80) |
| 8 | comment_width      | #66 (held out)        | filed [#81](https://github.com/mrflip/safebyok/pull/81) |

## What the threads have taught

*Orchestrator:* **Restacked into one merge line** at the Coach's word, after the sprint:
main → #70 → #75 → #80 → #68 → #72 → #67 → #69 → #82, so merging #82 merges them all. (It first
sat on #66, whose commits had already reached `main` under other SHAs through #63's merge; a
second rebase moved the line onto `main`, without a conflict, and justify ran green at the top.) Peers went
biggest first. #68's worker rebased it onto #80 (additive conflicts with #70; its tests moved
onto `TH.expectRefusal`), bumped the size budget (`openVault` 17 kB, everything 24.5 kB; the
Coach approved) and added the KDF TODO. #72, #67, #69 and #82 then rebased without a conflict,
and `pnpm justify` and `pnpm size` ran green once, at the top; CI checks the middle. #81 is held
out: the Coach redoes it after this line and big_feats' merge.

*Orchestrator:* **#66's tip moved** from `dfdbbec` to `5fefc90` during the sprint: three docs-only
commits (CLAUDE.md's console line, TODO.md's second_harvest questions, a changeset, the core's
eslint comment). Threads cut later start from `5fefc90`; a thread cut from `dfdbbec` rebases onto
it when it files, as thread 3 did.

*Orchestrator:* thread 3, react_dialog, filed as [#67](https://github.com/mrflip/safebyok/pull/67).
*Review:* `clean`, nothing fixed by the reviewer. The worker took two of its minor points before
filing: the pluralizer is `Intl.NumberFormat` (`useGrouping: false`, output identical), and the
test table's quotes follow STYLE.md. Left, as open questions on the PR: a misuse unlock never
settles the `withUnlockedVault` promise (follow-up: changes `onDone`'s contract); a sub-minute
window reads "1 minute"; the dialog's 168 default and recomputed `ForeverMs` can drift from the
core, which a core accessor for the window would end; the modal test's local helpers are thread
7's to consider.

*Orchestrator:* thread 1, kdf_configs, filed as [#68](https://github.com/mrflip/safebyok/pull/68).
`Argon2idWebV1` moved to `src/key-deriver-spec.ts` (no Argon2 code, no Zod); `argon2idDeriver(spec)`
is exported; a `KeyDeriver` carries its spec's fields beside `deriveKeyBytes`. `openVault` refuses a
deriver labelled `argon2id_web_v1` without exactly that spec's parameters (breaking, minor bump);
`unlock()`/`changePassphrase()` refuse key bytes not 32 long; `keyDeriverShape` bounds `salt_bytes`
to 1..65536. It owns VOCABULARY's key-deriver rows and the last `notes/security.md` entry.
*Review:* `fixed` -- the `iterations` refusal now names the 2^32 ceiling; the worker then added
"test your bytes against ours" to the supplied-label refusal. Left, as open questions on the PR: a
hand-built deriver under a host label declaring `algorithm: 'argon2id'` gets only the generic salt
check at open, so an unrunnable spec fails at `unlock()` with no `kind` (candidate follow-up: run
the Argon2id schema whenever `algorithm === 'argon2id'`); `KeyDeriver` carries Argon2id's optional
fields for every deriver (public surface, before 1.0); key bytes not zeroed (predates); bounds
repeated as literals; the 32-byte check accepts any `ArrayBufferView`; one supplied spec; no
reserved label namespace.

*Orchestrator:* other sessions now have worktrees stacked on this sprint's branches (for example
`byok-argon2_wasm` on #68's tip, `byok-big_feats`, `byok-unlock_envelopes`). They are not this
sprint's; nothing here touches them.

*Orchestrator:* thread 2, vaultdb_validation, is `ready` (survey in its branch's
`validation-survey.md`). For later threads: VaultDB's write verbs now parse every record and
expectation (unknown fields stripped, refusals never quote); `openVault` checks its options bag,
`userId`, and the shapes of `vaultDB`/`deviceDB`; listeners and callbacks must be functions; the
IndexedDB `dbName` goes through `src/idb-opts.ts`. The Convex test "never quotes a record the
deployment refused" now adds its stray field through a wrapping client -- **thread 6 builds on
that client** rather than on Zod letting a field through.

*Orchestrator:* **a size-budget collision to watch.** `openVault`'s budget is 16.5 kB; thread 1
(#68) takes it to 16.19 and thread 2 to 16.27, each from 15.9. Together they likely pass 16.5, so
whichever merges second will fail `pnpm size` in CI and needs either a raised budget (the Coach's
word) or a trim. Thread 8 and anything else touching `vault.ts` should not add to the bundle.

*Orchestrator:* thread 5, docs_refresh, filed as [#69](https://github.com/mrflip/safebyok/pull/69) without a thread review: its diff is
`notes/security.md`, `VOCABULARY.md` and two reworded comments in `vault.ts`, so no thread review.
It added a "Names, records and times" section to VOCABULARY and removed the `whisperSchemaVersion`
row (nothing exports or stores it). **Thread 8**: VOCABULARY's table rows run past 100 columns and
cannot wrap -- the comment-width rule must leave Markdown alone (it is about source comments).

*Orchestrator:* thread 2's *Review:* `fixed` -- the `maxVaultBytes` doc and the security note now
say the 2 KiB covers a lockbox's other fields for a `user_id` up to 512 bytes (nothing bounds
`user_id`). Verified: no new refusal quotes its input; stripping unknown fields drops nothing the
stored format needs; the reframed inequality admits exactly the old configurations. Left, as open
questions: `user_id` unbounded; a control-character note escapes past 2 KiB on a JSON backend;
`openVault` duck-types `vaultDB` (a hand-written object skips the write checks); small
duplications. **Re-plan:** thread 6 now stacks on thread 2 (it strengthens the Convex "never
quotes a record" test thread 2 rewrote; both would rewrite the same lines), so thread 6 is cut
from thread 2's tip once it files, and thread 7 from thread 6's.

*Orchestrator:* thread 2 filed as [#70](https://github.com/mrflip/safebyok/pull/70) (tip `d874db3`);
its review is posted on the PR. Its open questions add to the Coach's list: the `openVault`
size budget will not hold both #68 and #70; is the reframed allowance enough; `user_id` has no
length bound; should `erase()` tolerate a `corrupt_record` box; should `SafebyokComponent.api`
check `getUserId` at load.

*Orchestrator:* **paused 10:18-11:19 at the Coach's word** (session limit). Thread 4 checkpointed
at `830e2ed` during the pause (justify green at `1070c86` below it) and has resumed. Thread 4's
findings so far: Dependabot's `directory: /` already covers `packages/*` and `demos/*` (no config
change); justify ~35 s -> ~20 s warm, with a `SAFEBYOK_SKIP_BUILD_DEPS` env var that the root's
build and test set so each package builds once. Thread 6 was cut from #70's tip after the pause.

*Orchestrator:* thread 4, ci_tooling, is `ready` (tip `0fd009a`). For later threads: the root's
`justify` installs once and runs lint, typecheck and test across the workspace four packages at a
time; root `build`/`test` set `SAFEBYOK_SKIP_BUILD_DEPS=1` so each package's `build:deps` is
skipped and every package builds once, in order. A package tested alone still builds its
dependencies. It realigned the `types.test.ts` tables and four Convex `validators.test.ts` rows,
and fixed `wakeupAtNextTick`'s `@example` (doc block only) -- thread 7, leave those lines be.
For the Coach: a Dependabot PR that moves a public package's runtime dependency now fails CI
until a changeset is pushed to its branch (after which Dependabot stops rebasing it); the
Version PR's skip trusts the `changeset-release/` branch name (predates).

*Orchestrator:* thread 4 filed as [#72](https://github.com/mrflip/safebyok/pull/72). *Review:*
`fixed` -- `dependabot.yml`'s comment lost its dated run record (a progress note); the worker then
made `SAFEBYOK_SKIP_BUILD_DEPS` skip only on exactly `1` and corrected the "side by side" wording.
Verified by reading: the npm hash check fails closed before the install; the gate fails if its
script errors; every test path builds first. Not run: GitHub Actions itself. Left, as open
questions: a build failure skips every package's tests (deliberate); the Dependabot gate keys on the
PR's author; removed/made-private packages, `peerDependenciesMeta`, `bundledDependencies` not
compared; `justify:root` unused; convex's `./test` entry imports a devDependency (predates).

*Orchestrator:* thread 6, thin_tests, is `ready` (tip `83b0a9a`). **For thread 7, which stacks on
it:** `safebyok/testing` now has one `expectRefusal` (by `name` and `kind`, returns the error),
`thrownText`, `leafTexts` and `omitting`; all four old refusal helpers are gone (Convex's
`server.test.ts` and `component/vaults.test.ts` keep their own `refusalOf`, which reads
`ConvexError` data -- a different contract). The demo has `tests/test-helpers.tsx` (`makeWorld`,
`answerPassphraseDialog`, `Passphrase`). Thread 6's leads for thread 7: `fakeAnthropic` vs
`makeFakeAnthropic`; the test "worlds" across core and React; the probe components. For the Coach:
should `convexVaultDB` keep Convex's validator error as a refusal's `cause` (on a dev deployment
it quotes the refused arguments; `notes/security.md` accepts it today)?

*Orchestrator:* thread 6 filed as [#75](https://github.com/mrflip/safebyok/pull/75) (tip `c7e2da9`,
stacked on #70). *Review:* `fixed` -- the missing-`vaultDB`/`deviceDB` loop checks each field's own
message; the demo outage tests check `isVaultError` (the host's class) again; the changeset says
`describeVaultDB` now requires refusals named `VaultError` (a third-party adapter refusing with a
plain `Error` + `kind` goes red). The worker then made the KnockKnock Cancel test meaningful
(mutation-checked). Left, as open questions: the core's ~135 refusal sites check name and kind,
not class (recorded); the Convex sweep counts public constant leaves; some demo handles never
close; the inspection-panel tests share module stores; `createAuth` doesn't validate `clock`; and
the Convex-cause question for the Coach. Note: the reviewer worked round a denied Python edit by
making the same edit by hand (`ed955db`); the edit itself is sound and kept.

*Orchestrator:* thread 7, test_helpers, is `ready` (tip `1c5fa4c`, 13 commits on #75). Call
sites -464 lines, helpers and their tests +483 (net +19). Newly published in `safebyok/testing`:
`memoryVaultOpts`, `describeDeviceDB`, `holdNextCall`/`beforeNextCall`, `tallyWatches`,
`freshDbName`, `noBoxYet`, `thisVault` (minor changeset); `safebyok/testing` now imports runtime
code (`localVaultDB`, `memoryStore`, `memoryDeviceDB`). `restoreMocks`/`unstubGlobals` and a
`tests/setup.ts` cleanup replace ~20 hand-kept hooks; `vitest/expect-expect` counts any `expect*`
or `TH.expect*` helper as an assertion. Declined: folding the ~25 lock-mid-unlock blocks (would
hide the order of events). For the Coach: the `expect*` naming convention in all five lint configs.

*Orchestrator:* **re-plan for thread 8**: it starts now rather than after thread 7 files. It is
cut from #66's tip, where none of the other threads' work exists, so waiting bought nothing; they
all wrote new comments within 100 columns. It reflows source comments on its base only (never
Markdown), enforces a 100-column comment width in every lint config, and records the recipe so
the reflow can be redone in minutes after the rest merge. The Coach merges it last.

*Orchestrator:* thread 8, comment_width, is `ready` (tip `8beb048`). `@stylistic/max-len` with
`{ code: 1e5, comments: 100, ignoreUrls: true, ignorePattern: <eslint directives> }` in all five
configs; 116 comment lines rewrapped across 40 files, the 7 eslint-directive lines left long (a
wrap silently unused each directive). The rule does not catch a comment trailing code (that would
need a code-length limit). The reflow (`140f0f4`) and the rule (`323334a`) are separate commits,
and `comment_width-reflow-recipe.md` holds the scripts to redo the reflow after the rest merge.

*Orchestrator:* thread 7 filed as [#80](https://github.com/mrflip/safebyok/pull/80) (tip `98c67d1`,
stacked on #75). *Review:* `fixed` -- the Convex "hears nothing once unsubscribed" test counts
after `unsubscribe()` again; the changeset names `AsyncVerbOf`. The worker then froze `noBoxYet`
and `thisVault`. Left, as open questions: `tallyWatches` can let a double close hide a leaked watch
(now public surface); `beforeNextCall` on an existing spy records a call twice; `convexRefusalOf`
and a `tallyWatches` example lack tests; `stateOnOpen` leaves its vault open; the `expect*` lint
convention; the runtime imports in `safebyok/testing`; the `as unknown as` cast. **Leftover:**
`/workspace/byok-test_helpers` (~21 MB, unregistered, everything pushed) remains on disk; the
worker's `rm -rf` was refused by the permission check, so it waits for the Coach.

*Orchestrator:* thread 8 filed as [#81](https://github.com/mrflip/safebyok/pull/81) -- **merge it
last**; redo the reflow from its recipe rather than resolving conflicts. *Review:* `fixed` -- the
reflow had split `{@link FarFuture}` in `vault.ts`; rewrapped whole. The worker then fixed the
recipe (`reflow-ex.mjs` null check, `verify.mjs` rewritten on TypeScript's scanner, a new
`inline-tags.mjs` step). Left, as open questions: a long `// @ts-expect-error` line is flagged;
STYLE.md's "two more spaces" against four columns in use; trailing comments are not caught.
**Leftover:** `/workspace/byok-comment_width` remains on disk (unregistered, everything pushed).

*Orchestrator:* **the sprint is done**: eight threads, eight PRs. See
`winboard/20261015-gripe_fixes/20261015-sprint_gripe_fixes_done-human.md` for the merge order and the open questions.
