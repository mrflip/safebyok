# Sprint gripe_fixes -- plan

* **Date**: 2026-10-15
* **Mode**: YOLO (with the Coach's caveat: a fix that looks weird, or whose relevance is hard to
  judge, is left out and reported, not forced)
* **Review level**: medium
* **At once**: 3 threads
* **Issued by**: flip (the Coach), over the dispositions marked in
  `winboard/20261015-gripes/20261015-gripes.md`
* **Status**: done and restacked -- one merge line main → #70 → #75 → #80 → #68 → #72 → #67 → #69 → #82; #81 held out for the Coach; see `winboard/20261015-gripe_fixes/20261015-sprint_gripe_fixes_done-human.md`

## Read first

* `winboard/20261015-gripes/20261015-gripes.md` **on this sprint's branch** (`20261015-gripe_fixes`,
  in `/workspace/byok-gripe_fixes`): the gripes list with the Coach's marks. Your thread quotes its
  entries; the *Sources* there lead to the original complaints (`gh pr view`, `git show`).
* `winboard/20261015-second_harvest/20261015-sprint_second_harvest_done-human.md` and
  `winboard/20261015-second_harvest/second_harvest-plan.md` (on your base): what the stack below
  you just built -- zod/mini, the clock checks, epoch-ms times, the pluggable logger, `TH` test
  helpers published as `safebyok/testing`.
* STYLE.md and VOCABULARY.md before naming anything or writing a test.

## Ground rules

* **Every thread is cut from #66's tip**, `dfdbbec` (`origin/20261015-second_harvest`), the top of
  the second_harvest merge stack ([#62](https://github.com/mrflip/safebyok/pull/62) zod_mini →
  [#52](https://github.com/mrflip/safebyok/pull/52) test helpers →
  [#64](https://github.com/mrflip/safebyok/pull/64) clean_times →
  [#65](https://github.com/mrflip/safebyok/pull/65) pluggable_logger →
  [#66](https://github.com/mrflip/safebyok/pull/66) its documents). That stack rewrites most of what
  these threads touch. Each PR files against `main` and says **"Stacked on #66"** first thing in its
  body; its diff carries the stack until the Coach merges #66. Thread 7 stacks on thread 6 instead.
* **Push only with an explicit refspec**:
  `git -c credential.helper= -c credential.helper='!gh auth git-credential' push origin <branch>:<branch>`.
  No upstream, no force-push.
* **"Nothing to fix" is a fine outcome** (the Coach: "there might not be anything to fix, if so
  just report that"). If an item proves already done on your base, say so with the evidence and
  move on. If one proves weird -- the fix would need a design call nobody has made, or the gripe
  no longer seems relevant -- leave it, and report it under *For the Coach*. Don't force it.
* Threads run side by side in different corners; where two touch one file (`notes/security.md`,
  `VOCABULARY.md`, `vault.ts`), keep hunks small and additive so the merges stay mechanical.

## Threads

Each thread quotes the gripes it takes, verbatim, the Coach's mark included.

### 1. kdf_configs

> **FIX** · see "enforced KDF" below The `keyDeriver` shape check accepts any positive `salt_bytes`, including 1 and values
> over the 65536 that `getRandomValues` allows. *Sources:* [#40 rev][c40].
>
> **FIX** · enforced KDF -- we should offer specific KDF configurations -- i.e. you can use one of the ones we supply, or you can call the method with a full option bundle. The library should deny values that are unworkable (65536) but allow values that are foolish (1) //// A hash-wasm KeyDeriver must carry the same label and the same hard-coded parameters,
> or vaults stop opening across devices. *Sources:* `TODO.md:220`.

*Gloss.* Today there is one spec, `Argon2idWebV1` (`key-deriver.ts`), and one deriver over it; a
`KeyDeriver` is `{ key_deriver_label, salt_bytes, deriveKeyBytes }`, shape-checked in `vault.ts`'s
`keyDeriverShape` with any positive `salt_bytes`. Build, keeping Argon2id through `@noble/hashes`
(parameters, not a new construction -- never invent cryptography):

* **Supplied configurations**: `Argon2idWebV1` stays, and stays what `browserOpts()` hands over. Add
  others only if each comes from a published recommendation (RFC 9106 §4, OWASP's Argon2id
  minimums) with its own label; one supplied configuration is an acceptable answer. Record the call.
* **A full option bundle**: an exported factory (name it per STYLE.md and VOCABULARY.md) taking the
  whole Argon2id parameter set and its label, returning a `KeyDeriver`; the shipped deriver becomes
  that factory over `Argon2idWebV1`.
* **Refuse the unworkable, allow the foolish**: `bad_option` for what cannot run -- a `salt_bytes`
  past `getRandomValues`' 65536, a key length the vault cannot use (it needs 32 bytes), and whatever
  Argon2id or `@noble/hashes` itself refuses (check its real limits: if it refuses a 1-byte salt,
  then 1 is unworkable, and say so) -- while weak but runnable parameters pass. The `keyDeriverShape`
  check gets the same `salt_bytes` bounds, so a hand-built deriver can't ask for an unworkable salt either.
* **"Enforced"**: a substitute deriver (hash-wasm, native) must carry the same label *and* the same
  parameters as the configuration it stands in for. Where a deriver claims a supplied configuration's
  label, checking that it carries that configuration's parameters is the enforcement the Coach's
  heading suggests (it means a `KeyDeriver` carries its parameters: a public-surface change, fine
  before 1.0 with a minor changeset). Doc blocks and the core README say it plainly.
* **No stored-format change**: a vault keeps storing only `key_deriver_label`. If a host-chosen
  bundle turns out to need its parameters stored, stop and report `blocked`: that is a one-way call.
* A `notes/security.md` entry: what hosts may now choose, and what is refused versus allowed.
* `safebyok/testing`'s cheap test deriver must still pass the shape check.

*Touches*: `key-deriver.ts`, `vault.ts` (`keyDeriverShape`, `parseKeyDeriver`), `index.ts`,
`browser.ts`, README, `notes/security.md`, VOCABULARY.md, tests. *Model*: default.
*Depends on*: nothing in this sprint. *Look-ahead*: thread 5 checks VOCABULARY.md against the
exports of its own base, so this thread adds VOCABULARY lines for whatever it exports.

### 2. vaultdb_validation

> *FIX* · VaultDB's inputs are checked unevenly. `updateBundle`/`updateBox` do not validate
> `expected`, `createBundle` does not validate its input, `updateBundle` does not require
> `bundle.vault_id` to match, outgoing records rely on TypeScript, and `listBoxes` validates the
> projected shape, so a damaged ciphered field shows only at `read()`. *Sources:*
> [#18 rev a][c18a]; `WB:20261014-convex_vaultdb/convex_vaultdb-progress.md:52,53`;
> `WB:20261014-convex_vaultdb/thread-2-storage_verbs.md:64`.
>
> *FIX* · Do a full survey of validation Smaller validation gaps: `dbName` is unvalidated in `browserOpts`, `idbVaultDB` and
> `idbDeviceDB`; the remembered-unlock check does not compare the record's
> applabel/user_id/vaultlabel with the scope; and `clock` is defaulted but not shape-checked.
> *Sources:* [#40 rev][c40]; [#43 rev][c43];
> `WB:20261015-low_hanging_fruit/thread-6-boundary_audit.md:19`.
>
> **FIX** · The 1 KiB per-lockbox allowance is smaller than a lockbox's other fields at their
> largest; it fits only because of the 0.5 share. *Sources:* [#34 rev][c34r].

*Gloss.* **Survey first**: every module entrypoint of every published package's `src/` -- public
functions and their option bags, adapter factories, `VaultDB`'s verbs (a plug-in seam: hosts write
adapters on it), and every read from storage or a `DeviceDB`. For each, what is validated and what
is not. Write it to `winboard/20261015-gripe_fixes/validation-survey.md` on your branch (the
thread file links it). Then fix the gaps at real boundaries, the ones quoted above among them (check
first what [#64](https://github.com/mrflip/safebyok/pull/64) already did for `clock`). CLAUDE.md
says "validate at module entrypoints; write confident, paranoia-free code past that boundary", so
where a quoted gap is past the boundary (an outgoing record built by our own code, say), the answer
may be "deliberately not", recorded in the survey with the reason, not a new check. `listBoxes`
projection versus a whole-row check is your call, recorded. Validation errors never quote their
input. No stored-format change: until 1.0.0 a record that fails today's validation reads as
absent or corrupt.

**The allowance**: derive `LockboxFieldsBytes` (`vault.ts`) from the fields' real maxima -- the
boxlabel, the note at 256 characters of up to 4 UTF-8 bytes each, the wrapped lockboxKey, ids,
times, the scope -- or show by a test that the constant covers them, so it no longer leans on the
0.5 share.

*Touches*: `vault-db.ts`, `device-db.ts`, `idb.ts`, `browser.ts`, `vault.ts`, the Convex adapter's
`src/` if the survey finds gaps there, tests, maybe `notes/security.md`. *Model*: default.
*Depends on*: nothing in this sprint. *Look-ahead*: threads 6 and 7 rework tests; write new tests in
the `TH` style already on your base.

### 3. react_dialog

> **FIX** · The React passphrase dialog always says "Stays unlocked on this device for seven days",
> whatever `forcePassphraseReentryHours` is (`passphrase-modal.tsx:46`). *Sources:* [#40][pr40];
> `WB:20261015-low_hanging_fruit/thread-2-explicit_options.md:67`.
>
> *FIX* · `PassphraseModal` rethrows errors other than `wrong_passphrase` into a voided promise,
> so they go unhandled. *Partly addressed by:* [#55][pr55] closes the dialog as if dismissed when
> its unlock loses to a `lock()` (`packages/safebyok-react/src/passphrase-modal.tsx:26`); any other
> error is still rethrown into a voided promise (`passphrase-modal.tsx:27`). *Sources:*
> [#33 rev][c33].

*Pulled in from thread 6's entry*: "The wrong-passphrase path is untested, the modal test has a
redundant assertion, and the dialog copy is covered only there."

*Gloss.* **The copy**: say what this vault will actually do. If the `Vault` already exposes the
window (or the deadline, after an unlock), read it; if not, the provider or the dialog needs it
handed in, and the smallest additive surface wins. `Infinity` reads as "until you lock it". Your
call, recorded. **The rethrow**: an error other than the two handled ones must land somewhere a
host sees. [#61](https://github.com/mrflip/safebyok/pull/61)'s split is the guide: a condition
(`storage_unavailable`, `not_permitted`, ...) shows calmly in the dialog, since `VaultError`
messages never carry secrets; misuse goes to the error boundary (React's set-state-that-throws
pattern) or wherever `VaultProvider` already sends it. **Tests**: the wrong-passphrase path, the
other-error path, the copy for a few windows, `Infinity` among them; drop the redundant assertion.
*Touches*: `packages/safebyok-react/src/passphrase-modal.tsx`, maybe `vault-provider.tsx`, its tests,
the React README, possibly a small additive core accessor. *Model*: sonnet. *Depends on*: nothing.

### 4. ci_tooling

> **FIX** · `npm@12.2.0` is installed with no hash pin in the publish job, the only job holding
> the OIDC token (`release.yml:147`). *Sources:* [#22][pr22] "installed unpinned by hash in
> `publish`"; `WB:20261014-pr_releases/pr_releases-progress.md:81`.
>
> **FIX** · The changeset check skips Dependabot's PRs and the Version PR, so either can change a
> public package without a changeset. *Sources:*
> `WB:20261014-pr_releases/thread-3-changeset_releases.md:49`.
>
> **FIX** · Dependabot still has `directory: /`, never checked against the packages under
> `packages/` and `demos/` since the core moved. *Sources:* [#16][pr16]; [#16 rev][c16a];
> [#36][pr36]; `TODO.md:30`; `H:20261015-sprint_pr_releases_done.md:40`; ...
>
> **FIX** · `justify` is slow (about 37–40 s, 13 tsdown runs): each dependent package rebuilds the
> core, and `workspaceConcurrency: 1` serializes the rest. *Sources:* [#15][pr15]; ...
>
> **FIX** · #36's smaller items:
>   - `test:coverage` runs the root tests without coverage,
>   - `BundleCases` columns are misaligned
>   - `wakeupAtNextTick`'s `@example` promises more than one tick delivers. *Sources:* [#36 rev][c36].

*Pulled in from thread 6's plumbing entry*: "the Convex client tests need the core built first" (the
`pretest: pnpm build:deps` chain), which is the same mechanism as the slow `justify`.

*Gloss.* **npm pin**: fetch the tarball, check it against its registry `dist.integrity` (sha512)
recorded in the workflow, install from the checked file; or an equally boring hash-pinned route.
**Changeset gate**: the Version PR consumes changesets, so asking it for one is wrong by
construction -- keep that skip and say why in the workflow's comment. For Dependabot, require a
changeset only when the PR changes a *public* package's runtime dependencies (`dependencies`,
`peerDependencies`, `optionalDependencies`), so the Coach adds one by hand to that rare PR;
devDependency-only bumps pass. A small, tested script in `scripts/` (tests in `tests/scripts/`) is
fine; a third-party action holding write power is not. If you find a cleaner standard mechanism,
take it and record why. **Dependabot**: read GitHub's current docs on pnpm workspaces and set
`directory`/`directories` to whatever actually covers `packages/*` and `demos/*`, with the reason
in a comment. **justify**: measure first, then build each package once per root run, not once
per dependent (for example the root building in topological order and the packages' `pretest`
skipping a build already done), with `workspaceConcurrency` raised only where builds can't race.
Report before and after times. If there is no clean win, report that and leave it. **#36's items**:
the root `test:coverage` runs the root tests with coverage; align `BundleCases` (see
[#36 rev][c36] for which); fix the `@example`'s promise. *Touches*: `.github/`, root `package.json`,
`pnpm-workspace.yaml`, packages' `package.json` scripts, `scripts/`, `tests/scripts/`, one test helper
doc block. *Model*: default. *Depends on*: nothing. *Look-ahead*: thread 7 may move
`wakeupAtNextTick`; touch only its doc block.

### 5. docs_refresh

> **FIX** · `notes/security.md` needs its refresh: entries mid-rename or pre-release, and
> `rememberForMs` still named at `:105`. *Sources:* `TODO.md:193,196`; ...
>
> **FIX** VOCABULARY.md has not been checked line by line against
> the exports. *Sources:* `TODO.md:193,196`; ...
>
> **FIX** · `vault.ts:161,248` still say "pretending". *Sources:*
> `WB:20261015-low_hanging_fruit/thread-9-docs_sweep.md:36`.

*Gloss.* **security.md**: bring every entry's names and claims up to date with the code on your base
(the epoch-ms times, `ask_passphrase_at`, `forcePassphraseReentryHours`, zod/mini, the logger);
keep each entry's date as history; a superseded decision says what superseded it rather than
vanishing. **VOCABULARY.md**: every exported name of every published package's entry points
against VOCABULARY, both ways: an export it doesn't define, a definition naming nothing exported
or stored. Fix the document, not the code. A name the code gets wrong goes in your report.
**"pretending"**: the docs sweep left both uses (`vault.ts` ~227 and ~340 on your base) as
ordinary English, but the Coach marked it FIX: reword both. *Touches*: `notes/security.md`,
`VOCABULARY.md`, two comments in `vault.ts`. *Model*: sonnet. *Depends on*: nothing.
*Look-ahead*: threads 1 and 2 add their own `notes/security.md` and VOCABULARY lines; don't
reorganize those files so much that adding a line conflicts.

### 6. thin_tests

> **FIX** · Weak or thin tests:
>   * The demo covers `src/lib` but not its components (22%).
>   * The wrong-passphrase path is untested, the modal test has a redundant assertion, and the
>     dialog copy is covered only there.
>   * `createAuth` reads the global clock, so its test checks a window.
>   * The "never quotes a record" test is weak.
>   * `tweakB64` returns `'a'` for blank text, which is not decodable.
>   * There are two `expectRefusal` copies with different contracts.
>
> **FIX** · Test-plumbing hazards: after #36's `TH` rename, a vault.ts-chain thread must write
> `TH.testDeriver`; the Convex tests import the core's test helpers by relative path; a test
> omitting a required option needs a cast under `exactOptionalPropertyTypes`; and the Convex client
> tests need the core built first. *Partly addressed:* the `safebyok/testing` entry on main ends the
> relative-path imports and the `TH.testDeriver` hazard ...; the casts under `exactOptionalPropertyTypes` and
> the build-the-core-first `pretest` (`packages/safebyok-convex/package.json:41`) remain.

*Gloss.* The modal bullet goes to thread 3, the build-first `pretest` to thread 4: strike them here.
The rest: demo component tests (the demo's components with Testing Library and jsdom, as
`safebyok-react` already does: adding them as demo devDependencies is plainly boring, say so);
inject a clock into `createAuth` so its test pins a time; strengthen the Convex "never quotes a
record the deployment refused" test so it fails if a record's fields show up anywhere in what is
thrown; `tweakB64` refuses (or handles) blank text; one `expectRefusal` (check whether #52 already
merged the two); and a helper or typed builder in place of the `exactOptionalPropertyTypes` casts.
*Touches*: `demos/safebyok-demo-react` (tests, `auth.ts`), `packages/safebyok/tests/test-helpers.ts`,
the Convex tests. *Model*: default. *Depends on*: nothing, but runs after threads 1-3 take their
slots. *Look-ahead*: thread 7 stacks on this one and extracts helpers across every package's tests.

### 7. test_helpers

> *FIX* look thru the tests; identify things that should be helpers; write them and simplify

*Gloss.* Read every package's tests (and the root's `tests/scripts/`); find what repeats --
setups, fixtures, assertion shapes, fake adapters -- and pull each into a helper with a doc block
and a test of its own (STYLE.md, *Tests*), then simplify the call sites. Put a helper hosts would
want in `safebyok/testing` (published: additive surface, changeset), and one only our tests want
in the package's own `tests/` helpers; record which went where. No behaviour change: the tests
assert what they asserted. Report the line counts before and after. *Touches*: tests everywhere.
*Model*: default. *Depends on*: thread 6 (cut from its tip once filed; "Stacked on #<6>"). It
will conflict with threads 1-4's test hunks when the Coach merges: keep each call-site rewrite
mechanical, so the rebase is too.

### 8. comment_width

> **FIXd** · Comment lines over 100 columns remain in about 25 files, and nothing enforces a width.
> *Sources:* [#16 rev][c16a]; [#36][pr36]; `TODO.md:335`; ...

*Gloss.* Read as FIX: on #66's tip about 110 comment lines across 30 files run past 100 columns, and
`@stylistic/max-len` is `off` in every config. Turn on a comment width of 100 in the core's
`eslint.config.mjs` and the configs cut from it (code length stays the formatter's business unless
the linter can enforce comments alone; record what it can), and rewrap the comments to pass. Pure
reflow: no wording changes. *Touches*: comments everywhere, every `eslint.config.mjs`. *Model*:
sonnet. *Depends on*: **starts only when threads 1-7 have filed**, so it reflows their comments
too, cut from #66's tip like the rest. It conflicts in comments with every other open PR: the
Coach merges it last, and its thread file records the exact recipe so a later agent can redo it in
minutes after the rest land.

## Left out, for the Coach

* **A demo over Convex** (*FIX*: "A demo running over Convex is wanted, needs a deployment, and
  is not built"). It needs a deployment and an auth story for `getUserId`, both the Coach's to
  choose (which account, which auth provider or a demo fake). That makes it a design thread, not a
  gripe fix.
* **The REPLY on process docs** is recorded under *Addressed* in the gripes list. Its third answer,
  "sprint docs ... should be swept into the first thread", changes `/sprint`'s own mechanics: the
  orchestrator now keeps the documents on a branch of their own and files them last. This sprint
  runs as the skill stands. Rewriting `SKILL.md` to match is a follow-up awaiting the Coach's word on how.
  When the first thread files, its documents are still changing, so "swept in" needs a mechanism.

## Decisions taken in YOLO

1. **Every thread stacks on [#66](https://github.com/mrflip/safebyok/pull/66)'s tip**, not
   `origin/main`: the second_harvest stack rewrites the validation layer, the times, the logger
   and the test helpers these threads build on. Cutting from main would mean redoing each thread
   after the stack merges.
2. **This sprint's branch carries the gripes list**, committed from the main checkout's working copy
   (the Coach's marks, uncommitted on `20261015-gripes`), with the closed entries moved. The local
   `20261015-gripes` branch is superseded. Its `TODO.md` lines were not carried: the list says
   [#55](https://github.com/mrflip/safebyok/pull/55) and [#60](https://github.com/mrflip/safebyok/pull/60)
   made them droppable.
3. **"FIXd" read as FIX** (the comment-width entry): the lines are not fixed, whichever was meant.
4. **"pretending" gets reworded** although an earlier sweep judged it fine: the Coach's mark wins.
5. **VERIFY FIXED (root scripts) closed as verified**, no thread: checked under dash and
   `bash --posix` at `dfdbbec` (details in the gripes list, *Addressed*).
6. **Gripes not marked by the Coach are untouched**; marks other than FIX/VERIFY/NOTED (*fixed*,
   NOTYET, *ragebait*, REPLY) were treated as closing the entry, and the entries were moved, not
   acted on.
