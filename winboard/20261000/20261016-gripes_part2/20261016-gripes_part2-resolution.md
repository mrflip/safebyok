# 20261016-gripes_part2: resolution

The gripes_part2 sprint (2026-10-16) built the Coach's `proceed` rows from the gripe_rulings Open Matters tab as five threads: [#104](https://github.com/mrflip/safebyok/pull/104) validators_tightening, [#103](https://github.com/mrflip/safebyok/pull/103) test_hygiene, [#102](https://github.com/mrflip/safebyok/pull/102) convex_setup_check, [#101](https://github.com/mrflip/safebyok/pull/101) docs_rulings and [#117](https://github.com/mrflip/safebyok/pull/117) matters_followups, under the sprint's own documents PR [#100](https://github.com/mrflip/safebyok/pull/100); all are merged now, though the harvest lines below still say "open" for some. Gripes from its whiteboard files, its -human report and its PRs, as consolidated in `whiteboard/20261016-gripes_boogaloo/` (2026-10-16).

58 gripes: 32 unresolved, 26 resolved.

## Unresolved

- G061 **Decide:** whether `unlocklabel` is checked only where a way in is added (built), not where a stored envelope's label is read; rec entry-only — gripes_1_doc, todo_gripes, prs_open, whiteboard_gripes
- G118 **Decide:** group several offending values into one refusal ("Group error messages?"); Coach said fine-grained until there are too many — todo_gripes, whiteboard_gripes
- G172 **Decide:** write the table of what each validator guarantees (database limit, canary, constraint; client/server; read/send/write/entry) and place each check by it — todo_gripes, whiteboard_gripes
- G173 **Decide:** re-examine the validators interface: deposit validators on a dispatch object built once instead of passing a bag per verb; should a bare verb refuse or admit — prs_open, humans_gripes, whiteboard_gripes
- G174 **Decide:** whether well-formed text is a floor beneath a host's own schema too (a host `z.string()` admits a lone surrogate Convex then refuses) — todo_gripes, prs_open, whiteboard_gripes
- G175 **Decide:** whether `AnyTextValidators` admitting control characters in labels (which reach `snapshot.boxes`) is acceptable — todo_gripes, prs_open
- G176 **Decide:** whether server-side names as any text (Postgres route, `listBoxRecords`, GraphQL resolvers) is the guarantee for a host serving several clients — todo_gripes, bigfeats_doc, prs_60_80
- G177 **Decide:** whether the note's control-character rule must also hold on the server, in the listing, and under a host validator — todo_gripes
- G232 **Decide:** keep dropping every foreign Convex error's cause (built), or sniff `ArgumentValidationError`/`ReturnsValidationError` and keep the rest; rec drop all — gripes_1_doc, prs_open, whiteboard_gripes
- G233 **Decide:** demand a host function named `getUserId`, or make identity a core seam every adapter takes (it may not go through the database); "soonish" — todo_gripes, prs_open, whiteboard_gripes, old_gripes
- G475 **Decide:** approve #117's new public surface: `Sanitizer.refusalFor` on the main entry and the `unlocklabel` field of the validator bags — prs_open
- G028 Ship built-as-a-whole recommended KDF configurations plus functions to roll your own, following `argon2idDeriver(spec)` — todo_gripes, humans_gripes, prs_60_80, whiteboard_gripes
- G029 Reserve a label namespace for supplied KDF specs (refuse host labels like `argon2id_web_*`) — humans_gripes, prs_60_80, whiteboard_gripes
- G030 Run the Argon2id schema at `openVault` for any hand-built deriver declaring `algorithm: 'argon2id'`, so an unrunnable spec fails with a kind, not at unlock — humans_gripes, prs_60_80, whiteboard_gripes
- G031 Split the `KeyDeriver` type by algorithm (today `Partial<KeyDeriverSpec>` gives every deriver Argon2id's fields) before 1.0 — humans_gripes, prs_60_80, whiteboard_gripes
- G032 Zero the passphraseKey bytes after `importKey` in `unlock()` and `changePassphrase()` — prs_60_80, whiteboard_gripes
- G179 Record "label grammar on the server" in TODO's validator-guarantees section (thread 17), and move the label/user-id entries under it — bigfeats_doc, whiteboard_gripes
- G180 Verify Convex's real refusal text for a lone surrogate in a stored string (convex-test admits it) — todo_gripes, prs_open, whiteboard_gripes
- G183 `OurChecks` recognises our schemas by identity, so two copies of the core fall back to vaguer refusal wording — prs_open, whiteboard_gripes
- G184 Measure the cost of `checkValidators` on every verb call and every VaultProvider render — prs_open, whiteboard_gripes
- G244 Run a real Convex dev deployment's error text through the sanitizer and the "never quotes" leak test — prs_open, prs_60_80, whiteboard_gripes
- G255 PR#102 leftovers: `getUserId` relying on `this` passes the check; setup tests repeat `hostWith` and pin exactly 9 functions; `checkedApiOpts` cast; test counts disagree — prs_open, whiteboard_gripes
- G256 Measure importing `VaultError` into Convex `server.ts` with a real `convex deploy`, not only esbuild — prs_open
- G257 Sanitizer leftovers: safebyok's own Convex refusals still carry the `ConvexError` as cause; the two storage-trouble messages are near-copies; a client-side failure points at deployment logs — prs_open
- G375 `stateOnOpen` in the core's vault.test.ts leaves its vault open (one test counts on that watch) — prs_60_80, prs_open, humans_gripes, whiteboard_gripes
- G376 Amend the pending `20261015-thin_tests` changeset, which says `expectRefusal` checks "by name and kind rather than class" (status unclear: #103 may amend it) — prs_open
- G377 `beforeNextCall` restore writes an own property that shadows a prototype-level spy after restore — prs_open, whiteboard_gripes
- G378 The demo's two ordered tests in test-helpers.test.tsx break under `-t`, `.only` or shuffle — prs_open, whiteboard_gripes
- G417 Identify and pin minimum platform support (oldest browsers, Node 22, Bun, Hermes `Intl` and `\p{}` escapes); CI checks it and the README states it — todo_gripes, prs_open, prs_80_main, whiteboard_gripes
- G488 Review the three post-review changes no reviewer saw: #102's component check and trimmed message, #103's per-method `beforeNextCall` queue, #104's regex rewrite — humans_gripes
- G498 Close the `store()`-over-a-damaged-box race (and the store-then-erase gap) with a revision-checked erase in the VaultDB contract — Coach: "TODO it", at the contract tightening party once every adapter shares the battery — gripes_1_doc, todo_gripes, prs_80_main, humans_gripes, whiteboard_gripes *(deferred)*
- G506 Delete the leftover worktree directories and `git worktree prune` (look first at byok-strict_configs and byok-passkey_unlock, which hold unpushed work) — Coach: the Coach will, when things settle down — gripes_1_doc, bigfeats_doc, humans_gripes, prs_80_main, old_gripes, whiteboard_gripes *(deferred)*

## Resolved

- G060 `unlocklabel` has no validator slot → `validators.unlocklabel`, default `Label`; empty label `bad_label`; taken label refused unquoted (PR#117, open)
- G102 Size checks: once after serialization, or two? → Coach: keep both, note in TODO; estimate called conservative (Coach ruling; PR#117, open)
- G106 Should refused text reaching `snapshot.boxes` be capped or hidden? → Coach: no changes; render a damaged label as text (Coach ruling, PR#101 TODO)
- G110 Should `lockbox_too_large` fold into `vault_full`? → Coach: keep its own kind (Coach ruling, PR#101)
- G111 Should the old remembered-unlock sweep also run in `writeUnlock`, and stay as permanent code? → Coach: leave as is (Coach ruling, PR#101)
- G112 Closing a vault twice unsubscribes twice → second `close()` does nothing (PR#117, open)
- G113 Erasing a box under a refused name reads it twice; `read()`/`use()` docs omit `bad_label` → erase reads once; docs name bad_label (PR#117, open)
- G114 JSON escapes trip `vault_full` early; Convex weighs a record ~11 bytes heavier → record cap weighs real serialized bytes; vault estimate documented conservative (PR#117, open)
- G153 Should `Ckeys` stay public as an encoding contract? → Coach: keep public (Coach ruling, PR#101)
- G164 Narrowing validators later strands boxes as corrupt_record → they list as damaged and stay erasable (PR#93)
- G167 Should AnyTextValidators and the defaults refuse lone surrogates (Convex refuses them)? → Coach yes; refused as `bad_label`/`bad_option` (PR#104, open)
- G168 Refuse control characters in notes → Coach "do what's easy": C0, DEL, C1 refused, tab and newline kept (PR#104, open)
- G169 `safebyok/validators` re-exports Whisper and EpochMillis, pulling in zod unions → dropped, 8.36 to 3.86 kB (PR#104, open)
- G170 VaultProvider quietly drops a misspelt validators field → `checkValidators` refuses it as `bad_option` everywhere (PR#104, open)
- G171 A wrapper or bare VaultDB verb that forgets the validators bag falls back to defaults silently → admits any well-formed text (PR#104, open)
- G201 Should a JS adapter on the old `doListBoxes` contract get a runtime guard? → Coach: old-contract adapters fail as they do (Coach ruling, PR#101)
- G224 Accept the first-`watchVault`-emit deviation? → Coach: accepted as built (Coach ruling, PR#105 TODO)
- G226 Should `convexVaultDB` keep Convex's validator error (which quotes refused arguments) as a refusal's cause? → Coach: offer a sanitizer; every foreign Convex failure becomes `storage_unavailable` with no cause (PR#117, open)
- G227 Check `getUserId` (and the installed component) when the host builds it, not at first request → `bad_option` at setup (PR#102, open)
- G313 A misuse unlock never settles the `withUnlockedVault` promise → every call settles, resolving null (PR#98); Coach: #98's way stands (Coach ruling, PR#100)
- G354 Demo vaults opened from outside the page stay open; inspection-panel tests share module stores → closed in setup, stores wiped after each test (PR#103, open)
- G368 Is `expect*` / `TH.expect*` the lint convention for assertion helpers? → Coach yes, with nuance: an `expect*` helper must assert (STYLE.md rule, PR#101, open)
- G369 `tallyWatches` lets a double close hide a leaked watch → counts each watch closed once (PR#103, open)
- G370 `expectRefusal` checks name and kind, not class → requires `instanceof VaultError` (PR#103, open)
- G371 `beforeNextCall`/`holdNextCall` on an already-spied verb records twice; two armings run on one call → per-method queue, one arming per call (PR#103, open)
- G372 `convexRefusalOf` and `tallyWatches`' refused-open example have no test → tested (PR#103, open)
