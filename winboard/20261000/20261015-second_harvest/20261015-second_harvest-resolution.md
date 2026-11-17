# 20261015-second_harvest: resolution

The second_harvest sprint (2026-10-15) took the low_hanging_fruit sprint's leftovers and the Coach's rulings along the way, as seven threads: [#62](https://github.com/mrflip/safebyok/pull/62) zod_mini, [#61](https://github.com/mrflip/safebyok/pull/61) provider_conditions, [#58](https://github.com/mrflip/safebyok/pull/58) remembered_deadline (on [#57](https://github.com/mrflip/safebyok/pull/57), the epoch bounds), [#55](https://github.com/mrflip/safebyok/pull/55) lock_race, [#60](https://github.com/mrflip/safebyok/pull/60) screen_lock_recipe, [#64](https://github.com/mrflip/safebyok/pull/64) clean_times and [#65](https://github.com/mrflip/safebyok/pull/65) pluggable_logger, plus [#59](https://github.com/mrflip/safebyok/pull/59) (CLAUDE.md's pre-1.0 rule) and the sprint's closed documents PR [#66](https://github.com/mrflip/safebyok/pull/66). Gripes from its whiteboard files, its -human report and its PRs, as consolidated in `whiteboard/20261016-gripes_boogaloo/` (2026-10-16).

47 gripes: 23 unresolved, 24 resolved.

## Unresolved

- G115 **Decide:** #60's four `lockSoon()` calls (snapshot flips at once, unlock in grace wins, 60 s cap, `close()` throws `vault_closed`) and #55's `vault_locked` for a lost unlock; rec keep — todo_gripes, prs_60_80, humans_gripes, whiteboard_gripes
- G322 **Decide:** guard a `logger` (or validators) written inline in JSX that reopens the vault every render, beyond the README warning — todo_gripes, prs_60_80, humans_gripes, whiteboard_gripes
- G399 **Decide:** turn off `unicorn/prefer-iterator-to-array` while the lib target is ES2023 (it fights `prefer-spread`); rec off — todo_gripes, prs_60_80, humans_gripes, bigfeats_doc
- G435 **Decide:** release levels: several changesets bump minor where patch might do (adding `lockSoon`/`reentryWindowMs` breaks hosts' `Vault` fakes); rec minor pre-1.0 — todo_gripes, prs_60_80, humans_gripes
- G124 Build natural expiry's timer: shut at `askPassphraseAt` + 60 s, re-armed within setTimeout's 2^31-1 ms reach, taking over from `ensureUnlocked()`, with a security note — todo_gripes, prs_60_80, whiteboard_gripes
- G125 `lockSoon()` leftovers: an already-expired held key gets a full grace; `ensureUnlocked()` can take a key from a store in hand; grace timer not `unref`'d — prs_60_80, whiteboard_gripes
- G126 `close()` during an unlock's record write loses the older remembered record that write overwrote; `close()` does not move the shut counter — prs_60_80, whiteboard_gripes
- G127 A clock that goes bad mid `store()`/`erase()`/`changePassphrase()` lets the write land, then throws `bad_option` from the closing refresh — todo_gripes, prs_60_80, humans_gripes, whiteboard_gripes
- G128 A backward clock step erases a fresh remembered unlock — todo_gripes, humans_gripes, whiteboard_gripes
- G129 Tabs opening with different settings erase each other's remembered-unlock records — todo_gripes, humans_gripes, whiteboard_gripes
- G130 Wrap a `deviceDB.readUnlock` failure at open as `storage_unavailable` so it reaches `openError`, not the error boundary — todo_gripes, prs_60_80, humans_gripes, whiteboard_gripes
- G131 A lock in one tab does not stop an unlock under way in another (needs a shared signal); DeviceDB has no compare-and-erase — whiteboard_gripes
- G132 A lock during a wrong-passphrase check surfaces `wrong_passphrase` rather than `vault_locked` — whiteboard_gripes
- G134 Logger leftovers: rate-limit warnings from a watch on broken storage; log a failed catch-up after `stale_write` as such, not "a background refresh" — todo_gripes, prs_60_80, humans_gripes, whiteboard_gripes
- G135 Give `VaultLogger.log` a call site, or stop requiring it — todo_gripes, prs_60_80, humans_gripes, whiteboard_gripes
- G210 Logger everywhere (Coach: ready to start): report swallowed failures to `VaultLogger` — Convex watch (`convexVaultDB` logger option), Postgres listen, GraphQL subscription, IndexedDB, React — todo_gripes, bigfeats_doc, prs_60_80, humans_gripes, whiteboard_gripes
- G359 The demo's "saved" label shows `changed_at`, which stands still on an identical re-save — prs_60_80
- G408 Build layout: modules land under `dist/src/`; published helpers in `tests/` get test lint rules; `makeGate`'s lint disable ships; no source maps — todo_gripes, humans_gripes, whiteboard_gripes
- G409 Add `/* @__PURE__ */` to each schema to save `idbDeviceDB` ~0.5 kB — todo_gripes, prs_60_80, humans_gripes, whiteboard_gripes
- G490 The core README's screen-lock recipe's `.catch` also swallows a failed `eraseUnlock` — prs_60_80
- G500 An opt-in `lockWhenHidden` prop on safebyok-react (and its naming clash with the README recipe) — ruled "not yet" (TODO side quest) — old_gripes, whiteboard_gripes *(deferred)*
- G506 Delete the leftover worktree directories and `git worktree prune` (look first at byok-strict_configs and byok-passkey_unlock, which hold unpushed work) — Coach: the Coach will, when things settle down — gripes_1_doc, bigfeats_doc, humans_gripes, prs_80_main, old_gripes, whiteboard_gripes *(deferred)*
- G509 A finer unlock race analyser telling a lock the user meant from one that fell due while typing — NOT YET — todo_gripes, whiteboard_gripes *(deferred)*

## Resolved

- G014 Bind the whole public header (note, times) instead of a positional array; stored times were unbound → every written field bound, lockbox header and envelope `registered_at` included (PR#97)
- G015 A remembered unlock's deadline sits outside its encryption, so tampering can extend it → `ask_passphrase_at` bound under `safebyok-unlock-v1` (PR#97), and a deadline past this open's window is erased (PR#58)
- G022 Lock does not revoke key handles already in use → documented: work past its start finishes within the grace (PR#60)
- G081 Name the storage-trouble kinds, list every kind (vault_full included) with a family, split misuse from conditions → done (PR#18, PR#50, PR#54, PR#61)
- G083 Export the error families if a host asks → `VaultErrorFamilyVals`, `VaultErrorFamilyForKind`, `isVaultCondition` exported (PR#61)
- G084 A failed `openVault` leaks its storage watch (a live Convex watch per boundary reset) → handle closes itself, rejects with the original error (PR#61)
- G085 A `lock()` landing during `unlock()` leaves the vault unlocked and remembered → lock wins (PR#55); `lockSoon()` follows the same rule (PR#60)
- G086 Build `lockSoon(grace)` and a screen-lock recipe; say that locking ends the remembered unlock → built, README recipe and sign-out recipe (PR#60)
- G089 Upper cap on `forcePassphraseReentryHours`? → Coach "allow unlimited"; deadline clamped to FarFuture (PR#53, PR#57)
- G090 A remembered unlock keeps an older, longer deadline after the option is lowered (and Infinity grants outlive it) → erased on open when past this open's window (PR#58)
- G091 Make every stored time UTC epoch ms; rename `expires_at` to `ask_passphrase_at`; times named for the event → `registered_at`/`changed_at`, bounded whole ms (PR#57, PR#64)
- G092 Record that a `changed_at` standing still tells the backend two payloads were equal → in notes/security.md (PR#64)
- G093 Validate the host clock; a throwing `now()` escaped with no kind; a bad clock left the key held → `bad_option` at open, later bad readings fail closed (PR#64)
- G094 A pluggable logger with the console as fallback → `VaultLogger`, `src/console-logger.ts`; Coach: "yes with no logger console is the fallback" (PR#65)
- G096 Should `note: null` clear a note, and is it minor or patch? → built; no-back-compat rule settled the bump (PR#43, PR#59)
- G108 A vault that reads as corrupt (e.g. old field names) cannot be destroyed → `eraseDamagedVault` (Coach ruling, PR#115)
- G160 Type a host's policy as `Z.core.$ZodType` so classic and mini both fit → host schemas are any Zod 4 schema (PR#95)
- G161 Export `MaxUserIdChars`, `LockboxNote` and friends for host forms → exported from `safebyok/validators` (PR#58, PR#95)
- G309 VaultProvider drops an `openVault` rejection → thrown to the error boundary (PR#32), conditions handed down as `openError` with `retryOpen()` (PR#61)
- G348 A failed open should show in place with Retry, not throw → outage switch and "Can't reach your vault." with Retry (PR#61)
- G367 Move `tallyWatches` (written twice) into `safebyok/testing` → done (PR#80)
- G390 Shrink zod's share of a bare `openVault` (120-135 kB) → `zod/mini` and an unbundled build, `openVault` 30 to ~15 kB (PR#62)
- G397 Update CLAUDE.md's console line and the core eslint comment to name the fallback logger; confirm the `no-console` suppressions → done at the Coach's word (PR#65; CLAUDE.md)
- G462 Close PR#38 and PR#66, which had nothing left to merge → closed (gh pr list)
