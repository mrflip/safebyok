# 20261015-gripe_followups: resolution

Sprint gripe_followups: two threads answering the questions gripe_fixes left (`user_id` cap, `erase()` of a damaged box and the vault's unlock window; a write-up on overridable validation), built as [#87](https://github.com/mrflip/safebyok/pull/87) and [#85](https://github.com/mrflip/safebyok/pull/85), plus the sprint PR [#83](https://github.com/mrflip/safebyok/pull/83). Gripes from its whiteboard files, its -human reports and its PRs, as consolidated in `whiteboard/20261016-gripes_boogaloo/` (2026-10-16).

17 gripes: 5 unresolved, 12 resolved.

## Unresolved

- G322 **Decide:** guard a `logger` (or validators) written inline in JSX that reopens the vault every render, beyond the README warning — todo_gripes, prs_60_80, humans_gripes, whiteboard_gripes
- G435 **Decide:** release levels: several changesets bump minor where patch might do (adding `lockSoon`/`reentryWindowMs` breaks hosts' `Vault` fakes); rec minor pre-1.0 — todo_gripes, prs_60_80, humans_gripes
- G323 Add i18n string helpers: a host supplies its own strings and locale (one messages bag on VaultProvider or per-component props); sentence frames are English literals — todo_gripes, gripes_1_doc, prs_80_main, whiteboard_gripes
- G448 Give Dependabot runtime-dependency PRs their changeset without the Coach (today they fail CI until one is pushed, then stop rebasing) — prs_80_main, prs_60_80, humans_gripes, whiteboard_gripes
- G497 Accept Standard Schema (`@standard-schema/spec`) for host validators in place of a Zod type — later, per the Coach — gripes_1_doc, humans_gripes, prs_80_main, whiteboard_gripes *(deferred)*

## Resolved

- G103 Expose the resolved unlock window so the dialog stops re-deriving 168 h → `vault.reentryWindowMs`, `ForeverMs` exported (PR#87)
- G104 A lockbox row that breaks the listing locks the whole vault out; `erase()` reports corrupt_record after its delete → damaged boxes list as `{ boxlabel, damaged: true }`, erase removes them (PR#87, PR#93)
- G105 Let `store()` overwrite a damaged box, as `erase()` removes one → Coach yes, built (PR#93)
- G154 Pluggable label grammar: floor plus policy, narrow only, or full replacement? Labels in any script, any size → Coach: full replacement, no floor; `openVault({ validators })` (Coach ruling, PR#95)
- G157 Give `user_id` a length cap and a replaceable validation → `UserId` 1..100 (Coach ruling, PR#87); `validators.userId` (PR#95)
- G159 Re-export `z`? One home for base schemas? Standard Schema? → no `z`; `safebyok/validators` entry; Standard Schema later (Coach ruling, PR#95)
- G161 Export `MaxUserIdChars`, `LockboxNote` and friends for host forms → exported from `safebyok/validators` (PR#58, PR#95)
- G163 An inline validators bag would reopen the vault each render → VaultProvider depends on each schema, not the bag (PR#95)
- G310 The passphrase dialog always says "seven days" → states the vault's real window (PR#67), read from `vault.reentryWindowMs` (PR#87)
- G311 Word the window with `Intl.RelativeTimeFormat`? → Coach yes: "Locks again on this device in 7 days" (Coach ruling, PR#91)
- G458 Should PROCESS.md name `/closeout`; does a `/sprint` change ride its own PR; do sprint docs ride with the first thread? → Coach REPLY: no; orchestrator's call; swept into the first thread, built into /sprint (PR#83)
- G462 Close PR#38 and PR#66, which had nothing left to merge → closed (gh pr list)
