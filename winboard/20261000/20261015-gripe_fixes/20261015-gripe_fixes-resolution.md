# 20261015-gripe_fixes: resolution

Sprint gripe_fixes: eight threads over the Coach's FIX marks (KDF configurations, validation at every entrypoint, the React dialog, CI and tooling, the docs refresh, thin tests, shared test helpers, a 100-column comment rule), built as [#68](https://github.com/mrflip/safebyok/pull/68), [#70](https://github.com/mrflip/safebyok/pull/70), [#67](https://github.com/mrflip/safebyok/pull/67), [#72](https://github.com/mrflip/safebyok/pull/72), [#69](https://github.com/mrflip/safebyok/pull/69), [#75](https://github.com/mrflip/safebyok/pull/75), [#80](https://github.com/mrflip/safebyok/pull/80) and [#81](https://github.com/mrflip/safebyok/pull/81) (still an open draft), plus the sprint PR [#82](https://github.com/mrflip/safebyok/pull/82). Gripes from its whiteboard files, its -human reports and its PRs, as consolidated in `whiteboard/20261016-gripes_boogaloo/` (2026-10-16).

63 gripes: 27 unresolved, 36 resolved.

## Unresolved

- G122 **Decide:** whether `openVault` keeps duck-typing `vaultDB` (a hand-written object skips the base class's checks) or checks a brand — prs_60_80, humans_gripes, whiteboard_gripes
- G234 **Decide:** the demo over Convex needs a deployment and an auth story for `getUserId`, both the Coach's to choose — todo_gripes, old_gripes, humans_gripes, whiteboard_gripes
- G464 **Decide:** split VOCABULARY's `userId` (options) and `user_id` (records) into separate entries, or keep the one camel/underbar pair — prs_60_80, whiteboard_gripes
- G028 Ship built-as-a-whole recommended KDF configurations plus functions to roll your own, following `argon2idDeriver(spec)` — todo_gripes, humans_gripes, prs_60_80, whiteboard_gripes
- G029 Reserve a label namespace for supplied KDF specs (refuse host labels like `argon2id_web_*`) — humans_gripes, prs_60_80, whiteboard_gripes
- G030 Run the Argon2id schema at `openVault` for any hand-built deriver declaring `algorithm: 'argon2id'`, so an unrunnable spec fails with a kind, not at unlock — humans_gripes, prs_60_80, whiteboard_gripes
- G031 Split the `KeyDeriver` type by algorithm (today `Partial<KeyDeriverSpec>` gives every deriver Argon2id's fields) before 1.0 — humans_gripes, prs_60_80, whiteboard_gripes
- G032 Zero the passphraseKey bytes after `importKey` in `unlock()` and `changePassphrase()` — prs_60_80, whiteboard_gripes
- G033 `argon2idDeriver`: name bounds once instead of repeated literals, and report an oversized `parallelism` under its own field, not `memory_kib` — prs_60_80, whiteboard_gripes
- G034 Refuse with a kind a `deriveKeyBytes` result backed by a `SharedArrayBuffer` (today it fails at `importKey` with none) — prs_60_80, whiteboard_gripes
- G149 Reduce duplication in vault-db validation: `checkOutgoing`/`checkRecord`, four listener checks, scope comparison, double parse per write — prs_60_80
- G209 Catch a throwing listener once in the shared `subscribe` (`reportError` where available); the core memory store lets it escape a landed write — todo_gripes, bigfeats_doc, prs_80_main, whiteboard_gripes
- G244 Run a real Convex dev deployment's error text through the sanitizer and the "never quotes" leak test — prs_open, prs_60_80, whiteboard_gripes
- G249 Make the `./test` entry stop assuming Vite/vitest (`import.meta.glob`) and importing devDependency `convex-test`; stop wrappers restating validators — old_gripes, todo_gripes, prs_60_80, whiteboard_gripes
- G290 `placeholderOf` throws a plain Error at module load for a column-list mistake — bigfeats_doc, prs_60_80, whiteboard_gripes
- G360 Demo `createAuth` does not validate its `clock` — prs_60_80, whiteboard_gripes
- G375 `stateOnOpen` in the core's vault.test.ts leaves its vault open (one test counts on that watch) — prs_60_80, prs_open, humans_gripes, whiteboard_gripes
- G379 Move the passphrase-modal test's local helpers (`vaultUnlockingWith`, `submitPassphrase`, `Catcher`, `wrong`) into a React `tests/test-helpers.ts` — prs_60_80, whiteboard_gripes
- G381 The Convex leak sweep counts public constant leaves (format literals, `test_digest_v0`, fake salt) and could fail falsely — prs_60_80, whiteboard_gripes
- G413 In the root `test`, a build failure skips every package's tests, not only its own — todo_gripes, prs_60_80, whiteboard_gripes
- G414 CI's `test-build` builds twice; tests do not all run side by side (fix the pnpm-workspace comment or add `--no-sort`) — prs_60_80
- G446 Tighten the Version PR changeset skip, which trusts the `changeset-release/` branch name (needs the App's bot login) — todo_gripes, prs_60_80, humans_gripes, whiteboard_gripes
- G447 Make the Dependabot changeset gate check every commit is Dependabot's, not only the PR author — todo_gripes, prs_60_80, humans_gripes, whiteboard_gripes
- G448 Give Dependabot runtime-dependency PRs their changeset without the Coach (today they fail CI until one is pushed, then stop rebasing) — prs_80_main, prs_60_80, humans_gripes, whiteboard_gripes
- G449 `runtime-deps.ts` does not compare a removed/privatized package, `peerDependenciesMeta` or `bundledDependencies` — todo_gripes, prs_60_80, whiteboard_gripes
- G503 Hold comments to 100 columns (#81): redo the reflow from its recipe, decide trailing comments, `@ts-expect-error` lines, Markdown tables, STYLE's "two more spaces" — Coach: leave until 1.0.0-pre — gripes_1_doc, old_gripes, prs_open, prs_60_80, humans_gripes, whiteboard_gripes *(deferred)*
- G506 Delete the leftover worktree directories and `git worktree prune` (look first at byok-strict_configs and byok-passkey_unlock, which hold unpushed work) — Coach: the Coach will, when things settle down — gripes_1_doc, bigfeats_doc, humans_gripes, prs_80_main, old_gripes, whiteboard_gripes *(deferred)*

## Resolved

- G006 Bound `keyDeriverSpec.salt_bytes` to 1..65536 → built (PR#68)
- G007 Offer supplied KDF configurations or a full option bundle: deny unworkable values, allow weak ones, refuse an impostor wearing a supplied label → `argon2idDeriver(spec)` with bounds and label check (PR#68)
- G008 Should RFC 9106's second option ship as a second supplied spec? → Coach: no; becomes the "recommended KDFs + roll your own" TODO entry (Coach ruling, human/20261015-sprint_gripe_fixes_done.md)
- G101 The 1 KiB per-lockbox allowance is smaller than a lockbox's fields; is the reframing strict enough? → reframed (PR#70), then replaced by weighing each record at write (PR#95)
- G103 Expose the resolved unlock window so the dialog stops re-deriving 168 h → `vault.reentryWindowMs`, `ForeverMs` exported (PR#87)
- G104 A lockbox row that breaks the listing locks the whole vault out; `erase()` reports corrupt_record after its delete → damaged boxes list as `{ boxlabel, damaged: true }`, erase removes them (PR#87, PR#93)
- G105 Let `store()` overwrite a damaged box, as `erase()` removes one → Coach yes, built (PR#93)
- G150 Validate VaultDB inputs evenly (expectations, `createBundle`, `vault_id` match, outgoing records) → write verbs validate before `do*`; `updateBundle` refuses a changed vault_id (PR#70)
- G151 Survey every entrypoint for validation gaps (`dbName`, remembered-unlock scope, clock, listeners, options bag) → validation-survey.md and fixes (PR#70)
- G157 Give `user_id` a length cap and a replaceable validation → `UserId` 1..100 (Coach ruling, PR#87); `validators.userId` (PR#95)
- G226 Should `convexVaultDB` keep Convex's validator error (which quotes refused arguments) as a refusal's cause? → Coach: offer a sanitizer; every foreign Convex failure becomes `storage_unavailable` with no cause (PR#117, open)
- G230 Strengthen the weak "Convex client never quotes a record" test → sweeps every leaf of the refusal, mutation-checked (PR#75)
- G310 The passphrase dialog always says "seven days" → states the vault's real window (PR#67), read from `vault.reentryWindowMs` (PR#87)
- G312 `PassphraseModal` rethrows non-`wrong_passphrase` errors into a voided promise → conditions shown in place (PR#67); failures not the user's contained with a notice (PR#98)
- G313 A misuse unlock never settles the `withUnlockedVault` promise → every call settles, resolving null (PR#98); Coach: #98's way stands (Coach ruling, PR#100)
- G349 Demo components at 22% coverage; `createAuth` reads the global clock → jsdom tests to 97%, `createAuth` takes a clock (PR#75)
- G354 Demo vaults opened from outside the page stay open; inspection-panel tests share module stores → closed in setup, stores wiped after each test (PR#103, open)
- G364 Strengthen weak tests: wrong-passphrase path, redundant modal assertion, weak "never quotes", `tweakB64('')`, two `expectRefusal` copies → done (PR#67, PR#75)
- G365 Fix test-plumbing hazards: casts under `exactOptionalPropertyTypes`, binding tests needing the core built first → `TH.omitting`, one build per run (PR#72, PR#75)
- G366 Look through the tests for helpers, write them and simplify → `safebyok/testing` and per-package helpers, call sites −464 lines (PR#80)
- G367 Move `tallyWatches` (written twice) into `safebyok/testing` → done (PR#80)
- G368 Is `expect*` / `TH.expect*` the lint convention for assertion helpers? → Coach yes, with nuance: an `expect*` helper must assert (STYLE.md rule, PR#101, open)
- G369 `tallyWatches` lets a double close hide a leaked watch → counts each watch closed once (PR#103, open)
- G370 `expectRefusal` checks name and kind, not class → requires `instanceof VaultError` (PR#103, open)
- G371 `beforeNextCall`/`holdNextCall` on an already-spied verb records twice; two armings run on one call → per-method queue, one arming per call (PR#103, open)
- G372 `convexRefusalOf` and `tallyWatches`' refused-open example have no test → tested (PR#103, open)
- G384 Root scripts lose pnpm arguments under dash → Coach VERIFY FIXED, verified under dash and `bash --posix` (PR#36)
- G385 `justify` takes ~35-40 s with 13 tsdown runs → ~20 s, each package built once per run (PR#72)
- G386 Check Dependabot `directory: /` covers `packages/*` and `demos/*` → sufficient, comment added (PR#72)
- G387 #36's small items: root `test:coverage` without coverage, misaligned `BundleCases`, `wakeupAtNextTick` `@example` → fixed (PR#72)
- G388 `justify:root` is defined and never used → runs lint, typecheck and test and fails if any failed (PR#99)
- G427 Pin npm@12.2.0 by hash in the publish job → tarball checked against `dist.integrity`, installed offline (PR#72)
- G428 The changeset check skips Dependabot PRs and the Version PR → Dependabot PRs moving runtime deps need a changeset; the Version PR's skip stays by construction (PR#72)
- G451 Refresh notes/security.md (entries mid-rename, `rememberForMs`) and check VOCABULARY.md line by line against the exports → done; *Names, records and times* section added (PR#69)
- G452 Reword "pretending" in vault.ts → reworded (PR#69)
- G458 Should PROCESS.md name `/closeout`; does a `/sprint` change ride its own PR; do sprint docs ride with the first thread? → Coach REPLY: no; orchestrator's call; swept into the first thread, built into /sprint (PR#83)
