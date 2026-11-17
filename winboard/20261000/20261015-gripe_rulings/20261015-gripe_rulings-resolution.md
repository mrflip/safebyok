# 20261015-gripe_rulings: resolution

The gripe_rulings sprint (2026-10-15) took the Coach's rulings on what gripe_followups left and built them as four threads, in one merge line: [#92](https://github.com/mrflip/safebyok/pull/92) tuple_ckeys, [#95](https://github.com/mrflip/safebyok/pull/95) replaceable_validators, [#93](https://github.com/mrflip/safebyok/pull/93) damaged_boxes and [#91](https://github.com/mrflip/safebyok/pull/91) dialog_wording, under the sprint's own documents PR [#90](https://github.com/mrflip/safebyok/pull/90). Gripes from its whiteboard files, its -human report and its PRs, plus those from the sprint's Claude Doc (the `gripes_1_doc` source, which also carries the gripes_part2 status), as consolidated in `whiteboard/20261016-gripes_boogaloo/` (2026-10-16).

57 gripes: 13 unresolved, 44 resolved.

## Unresolved

- G061 **Decide:** whether `unlocklabel` is checked only where a way in is added (built), not where a stored envelope's label is read; rec entry-only — gripes_1_doc, todo_gripes, prs_open, whiteboard_gripes
- G121 **Decide:** whether the listing should detect damage it cannot see today (altered ciphertext, missing whisper show only at `read()`) — gripes_1_doc
- G232 **Decide:** keep dropping every foreign Convex error's cause (built), or sniff `ArgumentValidationError`/`ReturnsValidationError` and keep the rest; rec drop all — gripes_1_doc, prs_open, whiteboard_gripes
- G185 `Ckeys` does not check its inputs at runtime — prs_80_main
- G323 Add i18n string helpers: a host supplies its own strings and locale (one messages bag on VaultProvider or per-component props); sentence frames are English literals — todo_gripes, gripes_1_doc, prs_80_main, whiteboard_gripes
- G324 Dialog wording leftovers: a window just under `ForeverMs` reads "in 288,000,000,000 minutes"; an engine without `Intl.RelativeTimeFormat` throws to the boundary — gripes_1_doc, prs_80_main, humans_gripes, whiteboard_gripes
- G325 Test every window unit in the "Locks again" wording, not only the creating wording — gripes_1_doc, prs_80_main, whiteboard_gripes
- G417 Identify and pin minimum platform support (oldest browsers, Node 22, Bun, Hermes `Intl` and `\p{}` escapes); CI checks it and the README states it — todo_gripes, prs_open, prs_80_main, whiteboard_gripes
- G476 The host's validator can run up to four times per verb (`checkStandingBoxlabel` calls `Names.check` only for its refusal) (status unclear after #117) — gripes_1_doc, prs_80_main, humans_gripes
- G497 Accept Standard Schema (`@standard-schema/spec`) for host validators in place of a Zod type — later, per the Coach — gripes_1_doc, humans_gripes, prs_80_main, whiteboard_gripes *(deferred)*
- G498 Close the `store()`-over-a-damaged-box race (and the store-then-erase gap) with a revision-checked erase in the VaultDB contract — Coach: "TODO it", at the contract tightening party once every adapter shares the battery — gripes_1_doc, todo_gripes, prs_80_main, humans_gripes, whiteboard_gripes *(deferred)*
- G503 Hold comments to 100 columns (#81): redo the reflow from its recipe, decide trailing comments, `@ts-expect-error` lines, Markdown tables, STYLE's "two more spaces" — Coach: leave until 1.0.0-pre — gripes_1_doc, old_gripes, prs_open, prs_60_80, humans_gripes, whiteboard_gripes *(deferred)*
- G506 Delete the leftover worktree directories and `git worktree prune` (look first at byok-strict_configs and byok-passkey_unlock, which hold unpushed work) — Coach: the Coach will, when things settle down — gripes_1_doc, bigfeats_doc, humans_gripes, prs_80_main, old_gripes, whiteboard_gripes *(deferred)*

## Resolved

- G060 `unlocklabel` has no validator slot → `validators.unlocklabel`, default `Label`; empty label `bad_label`; taken label refused unquoted (PR#117, open)
- G101 The 1 KiB per-lockbox allowance is smaller than a lockbox's fields; is the reframing strict enough? → reframed (PR#70), then replaced by weighing each record at write (PR#95)
- G102 Size checks: once after serialization, or two? → Coach: keep both, note in TODO; estimate called conservative (Coach ruling; PR#117, open)
- G104 A lockbox row that breaks the listing locks the whole vault out; `erase()` reports corrupt_record after its delete → damaged boxes list as `{ boxlabel, damaged: true }`, erase removes them (PR#87, PR#93)
- G105 Let `store()` overwrite a damaged box, as `erase()` removes one → Coach yes, built (PR#93)
- G106 Should refused text reaching `snapshot.boxes` be capped or hidden? → Coach: no changes; render a damaged label as text (Coach ruling, PR#101 TODO)
- G110 Should `lockbox_too_large` fold into `vault_full`? → Coach: keep its own kind (Coach ruling, PR#101)
- G111 Should the old remembered-unlock sweep also run in `writeUnlock`, and stay as permanent code? → Coach: leave as is (Coach ruling, PR#101)
- G112 Closing a vault twice unsubscribes twice → second `close()` does nothing (PR#117, open)
- G113 Erasing a box under a refused name reads it twice; `read()`/`use()` docs omit `bad_label` → erase reads once; docs name bad_label (PR#117, open)
- G114 JSON escapes trip `vault_full` early; Convex weighs a record ~11 bytes heavier → record cap weighs real serialized bytes; vault estimate documented conservative (PR#117, open)
- G152 Colon is the one character ckeys cannot take; replace ":"-joined ckeys with an unambiguous tuple → `JSON.stringify` tuples via public `Ckeys` (Coach ruling, PR#92)
- G153 Should `Ckeys` stay public as an encoding contract? → Coach: keep public (Coach ruling, PR#101)
- G154 Pluggable label grammar: floor plus policy, narrow only, or full replacement? Labels in any script, any size → Coach: full replacement, no floor; `openVault({ validators })` (Coach ruling, PR#95)
- G155 Label-report details (LabelFloor ceiling, `labelRules`, `parseLabel`, rule scope, never transform, one message source) → superseded by check-only host schemas through `src/names.ts` (PR#95)
- G156 STYLE's `\w`-only labels refuse `anthropic-prod`; host-chosen boxlabels → hosts supply their own schema (PR#95)
- G157 Give `user_id` a length cap and a replaceable validation → `UserId` 1..100 (Coach ruling, PR#87); `validators.userId` (PR#95)
- G159 Re-export `z`? One home for base schemas? Standard Schema? → no `z`; `safebyok/validators` entry; Standard Schema later (Coach ruling, PR#95)
- G160 Type a host's policy as `Z.core.$ZodType` so classic and mini both fit → host schemas are any Zod 4 schema (PR#95)
- G161 Export `MaxUserIdChars`, `LockboxNote` and friends for host forms → exported from `safebyok/validators` (PR#58, PR#95)
- G162 Approve surface beyond the plan (AnyTextValidators, LabelPattern, MaxLabelChars, MaxNoteChars) → Coach: export what other libraries find useful (Coach ruling, PR#95)
- G163 An inline validators bag would reopen the vault each render → VaultProvider depends on each schema, not the bag (PR#95)
- G164 Narrowing validators later strands boxes as corrupt_record → they list as damaged and stay erasable (PR#93)
- G165 Add odd-label cases (`: " \ , [ ]`, Hebrew, Arabic, Thai) to describeVaultDB → OddLabels cases on every adapter (PR#92, PR#95)
- G166 Convex server-side label grammar? → Coach: do what comes naturally; the server accepts any string (Coach ruling; PR#95)
- G167 Should AnyTextValidators and the defaults refuse lone surrogates (Convex refuses them)? → Coach yes; refused as `bad_label`/`bad_option` (PR#104, open)
- G168 Refuse control characters in notes → Coach "do what's easy": C0, DEL, C1 refused, tab and newline kept (PR#104, open)
- G169 `safebyok/validators` re-exports Whisper and EpochMillis, pulling in zod unions → dropped, 8.36 to 3.86 kB (PR#104, open)
- G170 VaultProvider quietly drops a misspelt validators field → `checkValidators` refuses it as `bad_option` everywhere (PR#104, open)
- G171 A wrapper or bare VaultDB verb that forgets the validators bag falls back to defaults silently → admits any well-formed text (PR#104, open)
- G201 Should a JS adapter on the old `doListBoxes` contract get a runtime guard? → Coach: old-contract adapters fail as they do (Coach ruling, PR#101)
- G226 Should `convexVaultDB` keep Convex's validator error (which quotes refused arguments) as a refusal's cause? → Coach: offer a sanitizer; every foreign Convex failure becomes `storage_unavailable` with no cause (PR#117, open)
- G227 Check `getUserId` (and the installed component) when the host builds it, not at first request → `bad_option` at setup (PR#102, open)
- G265 `listBoxes` and `eraseVault` read every user's rows → key range over the vault's lockbox prefix (PR#109)
- G311 Word the window with `Intl.RelativeTimeFormat`? → Coach yes: "Locks again on this device in 7 days" (Coach ruling, PR#91)
- G313 A misuse unlock never settles the `withUnlockedVault` promise → every call settles, resolving null (PR#98); Coach: #98's way stands (Coach ruling, PR#100)
- G350 Show a damaged box as removable → damaged rows offer replace and delete only (PR#93)
- G354 Demo vaults opened from outside the page stay open; inspection-panel tests share module stores → closed in setup, stores wiped after each test (PR#103, open)
- G368 Is `expect*` / `TH.expect*` the lint convention for assertion helpers? → Coach yes, with nuance: an `expect*` helper must assert (STYLE.md rule, PR#101, open)
- G369 `tallyWatches` lets a double close hide a leaked watch → counts each watch closed once (PR#103, open)
- G370 `expectRefusal` checks name and kind, not class → requires `instanceof VaultError` (PR#103, open)
- G371 `beforeNextCall`/`holdNextCall` on an already-spied verb records twice; two armings run on one call → per-method queue, one arming per call (PR#103, open)
- G372 `convexRefusalOf` and `tallyWatches`' refused-open example have no test → tested (PR#103, open)
- G462 Close PR#38 and PR#66, which had nothing left to merge → closed (gh pr list)
