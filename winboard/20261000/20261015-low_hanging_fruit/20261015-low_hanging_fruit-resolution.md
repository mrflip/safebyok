# 20261015-low_hanging_fruit: resolution

The low_hanging_fruit sprint: fourteen threads (plus two follow-ups) of small, needed jobs from the preplan, one PR each: [#31](https://github.com/mrflip/safebyok/pull/31), [#32](https://github.com/mrflip/safebyok/pull/32), [#33](https://github.com/mrflip/safebyok/pull/33), [#34](https://github.com/mrflip/safebyok/pull/34), [#35](https://github.com/mrflip/safebyok/pull/35), [#36](https://github.com/mrflip/safebyok/pull/36), [#37](https://github.com/mrflip/safebyok/pull/37), [#40](https://github.com/mrflip/safebyok/pull/40), [#42](https://github.com/mrflip/safebyok/pull/42), [#43](https://github.com/mrflip/safebyok/pull/43), [#44](https://github.com/mrflip/safebyok/pull/44), [#45](https://github.com/mrflip/safebyok/pull/45), [#46](https://github.com/mrflip/safebyok/pull/46), [#50](https://github.com/mrflip/safebyok/pull/50), [#53](https://github.com/mrflip/safebyok/pull/53) and [#57](https://github.com/mrflip/safebyok/pull/57), and the sprint's own documents-only PR [#51](https://github.com/mrflip/safebyok/pull/51). Gripes from its whiteboard files, its -human reports and its PRs, as consolidated in `whiteboard/20261016-gripes_boogaloo/` (2026-10-16).

64 gripes: 15 unresolved, 49 resolved.

## Unresolved

- G117 **Decide:** whether erase-wins needs a kind apart from an exhausted retry's `stale_write`, and `vault_locked` vs `stale_write` when a retry finds the device relocked — old_gripes, humans_gripes, whiteboard_gripes
- G322 **Decide:** guard a `logger` (or validators) written inline in JSX that reopens the vault every render, beyond the README warning — todo_gripes, prs_60_80, humans_gripes, whiteboard_gripes
- G474 **Decide:** confirm #40's calls: the entry is `safebyok/browser` (the Coach had said `basic`), one frozen `browserOpts` bag per `dbName`, `SevenDaysMs` removed — old_gripes, whiteboard_gripes
- G025 Reserve `whisper_codec` (default `json_v1`) and `whisper_schema_version` (default 1) in the lockbox record and its binding; Convex schema widens with them — todo_gripes, old_gripes, whiteboard_gripes, humans_gripes
- G143 Avoid a full refresh on every refused `store()` in a vault at its limit — old_gripes, whiteboard_gripes
- G181 Sort `listBoxes` by code point instead of runtime-locale `localeCompare` (vault-db.ts, idb.ts), matching Convex byte order — old_gripes, humans_gripes, whiteboard_gripes
- G182 Tell hosts allowing non-ASCII labels to require NFC, and to widen a grammar only after every client upgraded — old_gripes, humans_gripes
- G245 Check production Convex read accounting against `getDocumentSize`, and a rollback deploy beside the leftover tally table — humans_gripes, whiteboard_gripes
- G258 `convexVaultDB` declares `maxVaultBytes` half the transaction read limit while the component holds 7 MiB less 1 KiB; an honest client can meet the component limit first — whiteboard_gripes
- G358 The demo LockChip prints a 2255 date for the clamped Infinity deadline; show "never" when `askPassphraseAt === FarFuture` — whiteboard_gripes
- G404 Fold `pnpm size` into `justify` (~2 s) — whiteboard_gripes, old_gripes
- G405 Size caveats: CI and `pnpm size` build the core twice; only ESM measured; size-limit's Node range vs engines `>=22` — old_gripes, bigfeats_doc, prs_60_80, whiteboard_gripes
- G469 Rename the devcontainer `byok-*` volumes at the next container rebuild (renaming orphans the old ones) — old_gripes, humans_gripes, whiteboard_gripes
- G500 An opt-in `lockWhenHidden` prop on safebyok-react (and its naming clash with the README recipe) — ruled "not yet" (TODO side quest) — old_gripes, whiteboard_gripes *(deferred)*
- G503 Hold comments to 100 columns (#81): redo the reflow from its recipe, decide trailing comments, `@ts-expect-error` lines, Markdown tables, STYLE's "two more spaces" — Coach: leave until 1.0.0-pre — gripes_1_doc, old_gripes, prs_open, prs_60_80, humans_gripes, whiteboard_gripes *(deferred)*

## Resolved

- G004 Confirm the KeyDeriver seam as the reading of "security first, pluggable second" → blessed in chat, made required in openVault (PR#40)
- G005 Correct notes/security.md's Argon2id claims (main entry imports Argon2id; noble's audit left argon2 out of scope) → corrected (PR#40, PR#86)
- G078 Retry a `store()` that loses a race → up to three attempts (PR#44) with a jittered doubling backoff (PR#45)
- G079 Use `p-retry`/`exponential-backoff` instead of the hand-written backoff? → Coach: keep our retry, note the library under RAGEBAIT (Coach ruling, PR#45)
- G081 Name the storage-trouble kinds, list every kind (vault_full included) with a family, split misuse from conditions → done (PR#18, PR#50, PR#54, PR#61)
- G082 Is `unknown_key_deriver` misuse or a condition? → Coach: misuse, as built (Coach ruling, low_hanging_fruit plan)
- G083 Export the error families if a host asks → `VaultErrorFamilyVals`, `VaultErrorFamilyForKind`, `isVaultCondition` exported (PR#61)
- G085 A `lock()` landing during `unlock()` leaves the vault unlocked and remembered → lock wins (PR#55); `lockSoon()` follows the same rule (PR#60)
- G086 Build `lockSoon(grace)` and a screen-lock recipe; say that locking ends the remembered unlock → built, README recipe and sign-out recipe (PR#60)
- G089 Upper cap on `forcePassphraseReentryHours`? → Coach "allow unlimited"; deadline clamped to FarFuture (PR#53, PR#57)
- G090 A remembered unlock keeps an older, longer deadline after the option is lowered (and Infinity grants outlive it) → erased on open when past this open's window (PR#58)
- G091 Make every stored time UTC epoch ms; rename `expires_at` to `ask_passphrase_at`; times named for the event → `registered_at`/`changed_at`, bounded whole ms (PR#57, PR#64)
- G093 Validate the host clock; a throwing `now()` escaped with no kind; a bad clock left the key held → `bad_option` at open, later bad readings fail closed (PR#64)
- G095 A note over 256 chars bricked the vault; DeviceDB output was trusted → note checked at `store()`, DeviceDB output validated (PR#43)
- G096 Should `note: null` clear a note, and is it minor or patch? → built; no-back-compat rule settled the bump (PR#43, PR#59)
- G098 Cap vault size (Convex could not erase past ~150 big lockboxes) → `maxVaultBytes`, `maxLockboxes`, `vault_full` (PR#34)
- G099 Should `maxVaultBytes` default or stay abstract? → Coach: abstract, no default (Coach ruling, PR#34)
- G100 Fix `ensureLimitsFit` letting an undeclared `maxRecordBytes` through and its "at most 0" message → fixed (PR#34)
- G152 Colon is the one character ckeys cannot take; replace ":"-joined ckeys with an unambiguous tuple → `JSON.stringify` tuples via public `Ckeys` (Coach ruling, PR#92)
- G154 Pluggable label grammar: floor plus policy, narrow only, or full replacement? Labels in any script, any size → Coach: full replacement, no floor; `openVault({ validators })` (Coach ruling, PR#95)
- G155 Label-report details (LabelFloor ceiling, `labelRules`, `parseLabel`, rule scope, never transform, one message source) → superseded by check-only host schemas through `src/names.ts` (PR#95)
- G158 `user_id` was once called `userlabel` and is not a Label → Label doc block and VOCABULARY fixed (old_gripes, Addressed)
- G161 Export `MaxUserIdChars`, `LockboxNote` and friends for host forms → exported from `safebyok/validators` (PR#58, PR#95)
- G166 Convex server-side label grammar? → Coach: do what comes naturally; the server accepts any string (Coach ruling; PR#95)
- G218 Put `safebyok-convex` in CI and give it its own configs, so its `justify` stops failing on an empty source → done (PR#16, PR#36)
- G221 Cap a Convex vault on the server (the client cap was the only guard; erase past ~150 big lockboxes) → per-vault tally, 8,000 lockboxes and 7 MiB, `vault_full` (PR#46)
- G222 Make the README's "about 150 lockboxes" a number the library enforces → enforced cap (PR#34, PR#46)
- G223 May a host set a lower server-side limit? → Coach: no host knob; disagreeing limits documented as undefined (Coach ruling, PR#46)
- G267 Say that a no-backend IndexedDB vault is best-effort and lost when site data is cleared → safebyok-indexeddb README, with `navigator.storage.persist()` (PR#33, PR#77)
- G316 safebyok-react prompts only on `vault_locked`, so a stale store/erase does not prompt → a retry finding the device relocked now throws `vault_locked` (PR#44)
- G337 Build `mask` in `safebyok/utils` after a library search; hand-writing it needs the Coach's yes → Coach set its contract ("a whiff from each end, best effort, safe in a log"); built (PR#37)
- G338 Should `mask` strip right-to-left letters and numbers? → Coach: keep them, strip only direction marks (Coach ruling, PR#37)
- G339 Stripping `\p{M}` drops Devanagari/Thai vowels and Arabic harakat → Coach accepted; documented in doc block, README, VOCABULARY (Coach ruling, PR#37)
- G340 `maxLen: Infinity` and vast `minStars` throw a bare RangeError; a too-small `maxLen` throws at render → capped at 1000; too-small `maxLen` gives that many stars (PR#37)
- G341 Smaller mask points: `Z.object` vs `strictObject`, `maskAll`, more invisibles, Hangul jamo, emoji cuts, errors.ts wording → Coach kept `Z.object`; `maskAll` struck; rest landed (PR#37)
- G342 Add a size-limit entry for `mask` → added (PR#37)
- G347 Ask for `navigator.storage.persist()` and say there is no recovery → done (PR#33)
- G361 Fix the flaky "altered ciphertext" tests in crypto.test.ts and vault.test.ts (overwriting with `A`, ~1 in 64) → flip a byte; `TH.tweakB64` (PR#25, PR#36)
- G363 Publish test helpers for adapter authors → `safebyok/testing` entry (PR#36, PR#38)
- G383 Root scripts chained with `&&` hide package failures; a stale root `dist/` fails lint; root build races → `--no-bail` both-runs, `**/dist/**` ignored, `--stream` (PR#16, PR#36)
- G384 Root scripts lose pnpm arguments under dash → Coach VERIFY FIXED, verified under dash and `bash --posix` (PR#36)
- G385 `justify` takes ~35-40 s with 13 tsdown runs → ~20 s, each package built once per run (PR#72)
- G389 Add a size-limit tree-shaking budget in CI; yes to `size-limit` and its preset → `.size-limit.json`, `pnpm size` (Coach yes, PR#42)
- G392 Test that a bare `openVault` import carries no argon2 → Rolldown tree-shaking test (PR#40)
- G420 `npm stage` would ship `workspace:` ranges; `pnpm pack` skips `prepublishOnly`; a hand-run publish could ship `@safebyok/source` → refused, rewritten, justified before pack, `require-pnpm` (PR#15, PR#22, PR#36)
- G450 Promote the proposed README to `packages/safebyok/README.md`, write the root README front page, and an adapter author's guide → core README, root README, VAULTDB.md and "Your own storage adapter" (PR#33, PR#77, PR#107)
- G453 Docs sweep: no-recovery line, screen-lock recipe, stale "stub" wording, release bullet, Label doc block → done (PR#33)
- G470 Land the renames that break after 0.1.0 before it: `keyDeriver` required, `rememberForMs` to `forcePassphraseReentryHours` (VaultProvider prop too), `expiresAt` to `askPassphraseAt` → done (PR#40)
- G471 Audit for late optional fields at critical boundaries (`Lockbox.note`, DeviceUnlock shape) → boundary audit (PR#43)
