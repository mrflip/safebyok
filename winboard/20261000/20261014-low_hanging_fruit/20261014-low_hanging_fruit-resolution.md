# 20261014-low_hanging_fruit: resolution

The preplan for the low_hanging_fruit sprint (revised 2026-10-15); the threads it listed were built by the sprint in `winboard/20261015-low_hanging_fruit/`, whose PRs are listed there. Gripes below are those its own file raised. Gripes from its whiteboard file, as consolidated in `whiteboard/20261016-gripes_boogaloo/` (2026-10-16).

33 gripes: 8 unresolved, 25 resolved.

## Unresolved

- G474 **Decide:** confirm #40's calls: the entry is `safebyok/browser` (the Coach had said `basic`), one frozen `browserOpts` bag per `dbName`, `SevenDaysMs` removed — old_gripes, whiteboard_gripes
- G025 Reserve `whisper_codec` (default `json_v1`) and `whisper_schema_version` (default 1) in the lockbox record and its binding; Convex schema widens with them — todo_gripes, old_gripes, whiteboard_gripes, humans_gripes
- G141 Design the conflict-handler hook for erase-versus-update collisions after the retry limit (Coach: comes with the retry work, which exists) — todo_gripes, old_gripes, whiteboard_gripes
- G356 Click through the demo's passphrase dialog in a real browser (set, enter, mistype, dismiss); no one has since safebyok-react became a built package — todo_gripes, old_gripes, humans_gripes, whiteboard_gripes
- G439 Deprecate `safebyok@0.0.0` (npm shows it not deprecated) — todo_gripes, old_gripes, whiteboard_gripes
- G469 Rename the devcontainer `byok-*` volumes at the next container rebuild (renaming orphans the old ones) — old_gripes, humans_gripes, whiteboard_gripes
- G503 Hold comments to 100 columns (#81): redo the reflow from its recipe, decide trailing comments, `@ts-expect-error` lines, Markdown tables, STYLE's "two more spaces" — Coach: leave until 1.0.0-pre — gripes_1_doc, old_gripes, prs_open, prs_60_80, humans_gripes, whiteboard_gripes *(deferred)*
- G506 Delete the leftover worktree directories and `git worktree prune` (look first at byok-strict_configs and byok-passkey_unlock, which hold unpushed work) — Coach: the Coach will, when things settle down — gripes_1_doc, bigfeats_doc, humans_gripes, prs_80_main, old_gripes, whiteboard_gripes *(deferred)*

## Resolved

- G004 Confirm the KeyDeriver seam as the reading of "security first, pluggable second" → blessed in chat, made required in openVault (PR#40)
- G078 Retry a `store()` that loses a race → up to three attempts (PR#44) with a jittered doubling backoff (PR#45)
- G086 Build `lockSoon(grace)` and a screen-lock recipe; say that locking ends the remembered unlock → built, README recipe and sign-out recipe (PR#60)
- G091 Make every stored time UTC epoch ms; rename `expires_at` to `ask_passphrase_at`; times named for the event → `registered_at`/`changed_at`, bounded whole ms (PR#57, PR#64)
- G098 Cap vault size (Convex could not erase past ~150 big lockboxes) → `maxVaultBytes`, `maxLockboxes`, `vault_full` (PR#34)
- G099 Should `maxVaultBytes` default or stay abstract? → Coach: abstract, no default (Coach ruling, PR#34)
- G155 Label-report details (LabelFloor ceiling, `labelRules`, `parseLabel`, rule scope, never transform, one message source) → superseded by check-only host schemas through `src/names.ts` (PR#95)
- G158 `user_id` was once called `userlabel` and is not a Label → Label doc block and VOCABULARY fixed (old_gripes, Addressed)
- G217 Make `safebyok` a peer of `safebyok-convex` (two copies break `instanceof VaultError`) → done (PR#41)
- G267 Say that a no-backend IndexedDB vault is best-effort and lost when site data is cleared → safebyok-indexeddb README, with `navigator.storage.persist()` (PR#33, PR#77)
- G309 VaultProvider drops an `openVault` rejection → thrown to the error boundary (PR#32), conditions handed down as `openError` with `retryOpen()` (PR#61)
- G337 Build `mask` in `safebyok/utils` after a library search; hand-writing it needs the Coach's yes → Coach set its contract ("a whiff from each end, best effort, safe in a log"); built (PR#37)
- G341 Smaller mask points: `Z.object` vs `strictObject`, `maskAll`, more invisibles, Hangul jamo, emoji cuts, errors.ts wording → Coach kept `Z.object`; `maskAll` struck; rest landed (PR#37)
- G347 Ask for `navigator.storage.persist()` and say there is no recovery → done (PR#33)
- G361 Fix the flaky "altered ciphertext" tests in crypto.test.ts and vault.test.ts (overwriting with `A`, ~1 in 64) → flip a byte; `TH.tweakB64` (PR#25, PR#36)
- G363 Publish test helpers for adapter authors → `safebyok/testing` entry (PR#36, PR#38)
- G383 Root scripts chained with `&&` hide package failures; a stale root `dist/` fails lint; root build races → `--no-bail` both-runs, `**/dist/**` ignored, `--stream` (PR#16, PR#36)
- G385 `justify` takes ~35-40 s with 13 tsdown runs → ~20 s, each package built once per run (PR#72)
- G386 Check Dependabot `directory: /` covers `packages/*` and `demos/*` → sufficient, comment added (PR#72)
- G389 Add a size-limit tree-shaking budget in CI; yes to `size-limit` and its preset → `.size-limit.json`, `pnpm size` (Coach yes, PR#42)
- G392 Test that a bare `openVault` import carries no argon2 → Rolldown tree-shaking test (PR#40)
- G423 Flip the Coach's switches: Actions may create PRs, tag ruleset widened to `safebyok*@*` → done by the Coach (human/20261014-changeset_releases)
- G453 Docs sweep: no-recovery line, screen-lock recipe, stale "stub" wording, release bullet, Label doc block → done (PR#33)
- G470 Land the renames that break after 0.1.0 before it: `keyDeriver` required, `rememberForMs` to `forcePassphraseReentryHours` (VaultProvider prop too), `expiresAt` to `askPassphraseAt` → done (PR#40)
- G471 Audit for late optional fields at critical boundaries (`Lockbox.note`, DeviceUnlock shape) → boundary audit (PR#43)
