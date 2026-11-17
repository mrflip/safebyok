# Sprint low_hanging_fruit: progress

**Status**: done. Fourteen threads, one PR each; nine merged (#31-#36, #40, #43, #44); open: #42, #45, #46, #50, #37, in the merge order given in (`winboard/20261015-low_hanging_fruit/20261015-sprint_low_hanging_fruit_done-human.md`). Newer than the plan wherever the two disagree.

Sprint doc: [Sprint low_hanging_fruit](https://claude.ai/code/artifact/5c68c0cb-3736-4ae7-9973-f69c1cdc5fe9), a mirror: *Plan* and *Progress* tabs (the orchestrator's), and under *Threads* one tab per thread, written by that thread's worker. *Orchestrator:* **the Docs tools disconnected at about 04:50 UTC**, after the session was interrupted; the doc stands as of then (threads 1-5 and 9-11 mirrored). The repo files are the record from here on; threads 6, 7 and 8 have no tab content.

## Status

| #  | Thread | Base | Status |
| -- | ------ | ---- | ------ |
| 1  | `vault_size_cap` | `origin/main` | merged [#34](https://github.com/mrflip/safebyok/pull/34) |
| 2  | `explicit_options` | thread 1 (#34, dd8c7ca) | merged [#40](https://github.com/mrflip/safebyok/pull/40) |
| 3  | `provider_open_rejection` | `origin/main` | merged [#32](https://github.com/mrflip/safebyok/pull/32) |
| 4  | `epoch_millis` | `origin/main` | merged [#31](https://github.com/mrflip/safebyok/pull/31) |
| 5  | `mask_utils` | `origin/main` | filed [#37](https://github.com/mrflip/safebyok/pull/37); rework done (90ccf9e); conflicts with main (needs a rebase) |
| 6  | `boundary_audit` | thread 2 (#40, 868ce73) | merged [#43](https://github.com/mrflip/safebyok/pull/43) |
| 7  | `stale_write_retry` | thread 6 (#43, ac8eb27) | merged [#44](https://github.com/mrflip/safebyok/pull/44) |
| 8  | `size_budget` | thread 2 (#40, ea3dc98) | filed [#42](https://github.com/mrflip/safebyok/pull/42); merges cleanly with main |
| 9  | `docs_sweep` | `origin/main` | merged [#33](https://github.com/mrflip/safebyok/pull/33) |
| 10 | `sandals` | `origin/main` | merged [#36](https://github.com/mrflip/safebyok/pull/36) |
| 12 | `convex_server_cap` | thread 7 (#44, a9b91f1), moved onto main (7510af7) | filed [#46](https://github.com/mrflip/safebyok/pull/46), reviewed (medium; 1 fix, 9 minor left); conflicts with main over #36's test-helpers rename |
| 13 | `error_kinds` | thread 12 (#46, c519073) | filed [#50](https://github.com/mrflip/safebyok/pull/50), stacked on #46; reviewed (medium; 1 fix) |
| 14 | `store_backoff` | thread 7 (#44, a9b91f1), moved onto main | filed [#45](https://github.com/mrflip/safebyok/pull/45) (no separate review: the Coach's direct follow-up) |
| 11 | `label_grammar_report` | `origin/main` | merged [#35](https://github.com/mrflip/safebyok/pull/35) (no review: documents only) |

## For the Coach

* ~~**[#46](https://github.com/mrflip/safebyok/pull/46)'s branch carried thread 13's six commits**~~ -- *reset to `c519073` on the Coach's yes (force-push with lease); #46 is thread 12 alone again.* Thread 13's branch was cut from `origin/20261015-convex_server_cap`, so git set that branch as its upstream,
  and its worker's push fast-forwarded #46 from `c519073` (thread 12, as reviewed) to `ebba509`. The orchestrator's
  mistake: its own note says to unset the upstream after cutting a worktree. Undoing it takes a force-push, yours or
  on your word: `git push --force-with-lease=20261015-convex_server_cap:ebba509 origin
  c519073:20261015-convex_server_cap`. Thread 13 then files on its own branch (`20261015-error_kinds`, already
  pushed), stacked on #46. A warning is on #46.

* **[#42](https://github.com/mrflip/safebyok/pull/42) (thread 8) stands on #40's pre-restack tip
  `ea3dc98`.** #34 and #40 were force-pushed (05:03, 05:10 UTC) onto main after #26 and #30;
  #42 was filed minutes later on the old base, so it carries old copies of #34's and #40's
  commits. Restacking it onto `868ce73` needs a force-push, which workers may not do: yours, or
  say the word and the orchestrator has it done with `--force-with-lease`. Thread 6, still
  unfiled, is being moved onto `868ce73` before it files.

* ~~**Thread 10's root scripts drop extra arguments**~~ -- *the Coach approved the reviewer's
  fix in chat at about 04:55 UTC*; applied on #36 as 9140e2f (fast-forward), proved with real
  pnpm and a stub under dash and bash `--posix`. The root step itself still takes no arguments.

* ~~#31 conflicts with main~~ -- the Coach rebased it (05:24 UTC); it merges cleanly now. The
  Coach also restacked #32-#37 and #40 onto main between 05:03 and 05:28.
* **Merge order and thread 10's `TH` rename.** Thread 10 rewrites the import line and helper
  uses of nearly every core test; the chain (1, 2, 6, 7) adds tests on the old names. Merging
  the chain first and thread 10 last keeps the stacked PRs rebase-free and puts all the `TH.x`
  repairs in one rebase of thread 10.
* **The ruled screen-lock recipe defeats the remembered unlock** (thread 9's review): `lock()`
  also erases the device's seven-day unlock, so `visibilitychange` -> `lock()` asks for the
  passphrase on every return to the tab, against the dialog's "stays unlocked for seven days".
  Should `lockSoon()` / `lockWhenHidden` drop the in-memory key but keep the device record?
* **A race in `unlock()`** (thread 9's review, `vault.ts`, outside every thread): a `lock()` that
  lands during unlock's KDF or `rememberDevice` awaits is overwritten, leaving the vault unlocked
  and remembered. No thread in this sprint touches `unlock()`: a candidate for its own thread.
* ~~Thread 1's open questions~~ -- *answered by the Coach*: `maxVaultBytes` stays abstract;
  error kinds listed in the core package (thread 13); a server-side cap in Convex (thread 12).
* **`storage_unavailable` in the React provider** (thread 3): thrown to the boundary as the
  preplan said; its own message says "try again shortly". Worth a look when the
  misuse-versus-condition split comes up.

## What the threads have taught

*Orchestrator:* condensed; each thread's own file (and sprint doc tab) has the detail.

* **Thread 1** (`vault_size_cap`, [#34](https://github.com/mrflip/safebyok/pull/34)) -- for
  threads 2, 6, 7:
  - The open-time check refuses when `maxLockboxes * (maxWhisperBytes + 1 KiB) > maxVaultBytes
    / 2`, not the preplan's plain product, which let 207 default-size lockboxes onto Convex,
    measured un-erasable. Defaults still fit. YOLO: accepted.
  - `store()` counts from the vault's current box list; `readBox` decides new-or-replacement; a
    vault that looks full triggers `ensureRoomFor`, which refreshes and recounts before refusing
    `vault_full`. It sits right after `readBox`, so thread 7's retry re-runs it.
  - Thread 2's landing spots: `maxLockboxes` follows `maxWhisperBytes`; option parsing is
    `parseMaxWhisperBytes`, `parseMaxLockboxes`, `ensureLimitsFit`; the provider adds
    `maxLockboxes` at the end of its destructure, `openOpts` and deps.
  - *Review:* fixed (security note: concurrent stores on one handle overshoot too). Taken at
    filing: an undeclared `maxRecordBytes` refused too; "not even one lockbox fits". Left: no
    server-side cap; a full vault refreshes on every refused store. Rebased onto #29.
* **Thread 2** (`explicit_options`, [#40](https://github.com/mrflip/safebyok/pull/40), stacked on #34) -- for threads 6, 7, 8:
  - `keyDeriver` is required (Zod-checked, the given object kept); `safebyok/browser`'s
    `browserOpts({ dbName }?)` returns one frozen bag per `dbName` (so an inline spread in a
    React render does not reopen the vault). `expiresAt` is `askPassphraseAt`;
    `forcePassphraseReentryHours` (default `ForcePassphraseReentryHours = 168`, fractions
    allowed, rounded to whole ms) replaces `rememberForMs`; `SevenDaysMs` is gone. Stored
    `expires_at` unchanged.
  - **Thread 8**: zod, not noble, is most of a bare `openVault` bundle: ~120 kB minified
    without noble, ~135 kB with. `tests/index.test.ts` bundles a bare `openVault` with
    rolldown (from `src/`) and greps for `argon2`, with a positive control.
  - For whoever lands second: #33's *Locking* section mentions `rememberForMs` (rename it);
    #37's `safebyok/utils` shares the `tsdown.config.ts`, `exports` and `typesVersions` lines.
    The React passphrase dialog always says "seven days" (for the expiry thread).
  - *Review* (re-run after an API error): fixed -- the security note and changeset now say noble
    is dropped only by a tree-shaking bundler (the main entry still re-exports
    `argon2idWebV1Deriver`). Left: no cap on `forcePassphraseReentryHours` lets an absurd value
    push `askPassphraseAt` past MAX_SAFE_INTEGER (Coach); a remembered unlock keeps its old
    deadline (expiry thread); `salt_bytes` unbounded (crypto policy); `dbName` unvalidated in all
    three idb functions; the bundle test reads `src/` (thread 8 covers `dist/`).
* **Thread 3** (`provider_open_rejection`, [#32](https://github.com/mrflip/safebyok/pull/32)):
  `VaultProvider` throws a rejected `openVault` during render; the React README's "When opening
  fails" section tells hosts to wrap it in an error boundary keyed on `userId`. *Review:* fixed
  (two tests). Left: `storage_unavailable` (Coach); a failed open still leaks openVault's watch
  until `open_vault_unsubscribe` (still on pre-move paths) lands.
* **Thread 4** (`epoch_millis`, [#31](https://github.com/mrflip/safebyok/pull/31)): almost nothing
  to change outside the stored fields: the demo's account `created_at` and one test clock.
  *Review:* clean.
* **Thread 5** (`mask_utils`, [#37](https://github.com/mrflip/safebyok/pull/37)): `safebyok/utils` with `mask`. **For any new entry**: tsdown's
  `exports: true` does not write `typesVersions`; attw's node10 check fails until it is added by
  hand. **For thread 8**: `mask`'s budget waits on thread 5 merging (4.1 kB built). Graphemes via
  `Intl.Segmenter`, code points without it; `maskAll` struck. **Superseded by the Coach
  (~05:30 UTC; plan decision 11)**: a best-effort, always-normalized, one-line whiff of each end;
  no segmenter; a too-small `maxLen` gives that many stars. Rebuilt on #37 (a08a811): private
  `plainLine` (NFC, then strip `\p{M}`, `\p{C}`, `\p{Z}`, default-ignorables, bidi controls,
  U+2800) runs before counting and again on the whole result; whitespace removed; RTL letters
  kept; default `maxLen` 15; an all-stripped whisper gives `minStars` stars. *Third review:* the
  guarantee holds; fixed a vast-`minStars` `RangeError` and U+1D159; flagged that kept RTL letters
  still reorder neighbours -- now stripped (plan decision 13), with U+FFFC, a second NFC pass, and
  an independent never-in-output list in the property test. No further review round. *Review:* flagged; orchestrator
  decided (YOLO): a `maxLen` below `head + tail + 9` is refused, so the result never exceeds
  `maxLen` (omitted `maxLen` defaults to `max(15, head + tail + 9)`); bidi controls, U+200B,
  U+2060 and U+FEFF are stripped. Second review: fixed (grapheme-counted ceiling test; the changeset names the floor and strip).
* **Thread 6** (`boundary_audit`, [#43](https://github.com/mrflip/safebyok/pull/43), stacked on #40 after a clean move onto its restacked tip) -- **for thread 7**: the note is checked once on entry to
  `store()` (new shared `LockboxNote`, refused as `bad_option`); `noteToStore(givenNote, prev)`
  sits right after `readBox`, so a retry re-derives it. Found and fixed: `store()` never checked
  the note, so a note over 256 characters was written and then read back as `corrupt_record`,
  locking the vault out for good; the vault trusted whatever a host's `DeviceDB` returned (an old
  `byok-unlock-v1` record still unlocked; a text or `Infinity` deadline) -- `rememberedUnlock`
  now checks it and erases one that fails. `LockboxSummary.note` is `string | null`; `null`
  clears a note. What is written is unchanged. Security note: a remembered unlock's
  `expires_at` sits outside its encryption binding, so whoever can write this device's IndexedDB
  can extend it. *Review:* clean, contract verified. Left for the Coach: clamp a remembered
  unlock's `expires_at` to `now + forcePassphraseReentryHours` on read (no crypto; a policy
  change); export `LockboxNote`; a vault already bricked by an over-long note still will not open.
* **Thread 7** (`stale_write_retry`, [#44](https://github.com/mrflip/safebyok/pull/44), stacked on #43): `store()`'s read-then-write runs through `retryStale`, up
  to `MaxWriteAttempts = 3` attempts (fresh `revision_id`, lockbox key, `ensureRoomFor` and
  `noteToStore` each time); a retry that finds the device relocked throws `vault_locked`; `erase()`
  is never retried. *Orchestrator:* first build re-created a box another device had erased
  mid-retry, against the ruled **"Erase wins"** (`rulings.md` line 23): sent back to surface
  `stale_write` instead, before review. Rebuilt (7f36804): erase wins across a retry; a box
  created meanwhile is retried over; under erase-wins a retry is never a new box, so
  `ensureRoomFor` runs again only when a rival created and then erased the box between attempts
  (tested). *Review:* fixed (doc block). Open for the Coach on #44: `vault_locked` vs
  `stale_write` on a relock; a distinct kind for erase-wins.
* **Thread 8** (`size_budget`, [#42](https://github.com/mrflip/safebyok/pull/42), stacked on #40): `.size-limit.json` at the **root**, not the core -- size-limit
  excludes a package's peers, and zod (the core's peer) is most of the bundle, so a core-level
  config would measure `openVault` at 7 kB and never show the zod-mini thread's gain. Brotli
  figures (limit ~7-8% above): everything 35.6 kB, `openVault` 29.3, `stableJsonify` 25.1 (zod's
  module-level schemas are not shaken out -- the zod-mini target), `argon2idWebV1Deriver` 5.0,
  `idbDeviceDB` 25.7, `browserOpts` 30.5. `pnpm size` builds the core first; CI runs it after the
  build; not in justify. The `argon2` grep test stays beside it. A `mask` entry waits on #37.
  *Review:* fixed (the CLAUDE.md line wrapped). Left: CI builds the core twice; size-limit wants
  Node `^22.19 || ^24.5 || >=26` against the root's `>=22`; a zod bump alone can trip it.
* **Thread 9** (`docs_sweep`, [#33](https://github.com/mrflip/safebyok/pull/33)): appended
  *Locking* and *No recovery* to the core README; the recipe is a `lockWhenHidden(vault)`
  function returning an unsubscribe -- the same name as the planned core API, so the expiry
  thread should rename one. The demo calls `navigator.storage.persist()`. `notes/security.md`
  gained a dated bullet for the release App key. Devcontainer volumes stay `byok-*`.
* **Thread 10** (`sandals`, [#36](https://github.com/mrflip/safebyok/pull/36); the React eslint header wrap was dropped at rebase, #29 had done it): after it merges, core tests star-import `test-helpers.ts` as `TH`; a
  rebased test using a bare `testDeriver`, `scopeOf` or `tweakB64` must write `TH.x`. Root
  scripts run the root check and `pnpm -r --no-bail`. `safebyok` is a peer of `safebyok-convex`.
  The slow justify is 13 tsdown builds; cheapest fix: build once at the start.
* **Thread 11** (report, [#35](https://github.com/mrflip/safebyok/pull/35)): all three labels could take a host grammar without touching a stored
  record or the binding; the colon is the one forbidden character (plain-concatenated ckeys);
  the hazard is the read path (`Label` types the record schemas). Seam: a fixed `LabelFloor` for
  reads, `OpenVaultOpts.labelRules` per slot for writes, validate never transform. No
  server-side grammar in Convex.
* **Process**: `strict_configs` landed as [#29](https://github.com/mrflip/safebyok/pull/29) (one
  strict tsconfig base, a `@safebyok/source` condition, eslint configs cut from the core's):
  threads cut before it rebase onto it at filing. `pnpm changeset` names files `.changeset/YYYYMMDD-<label>.md` itself since
  [#30](https://github.com/mrflip/safebyok/pull/30)
  landed (now on main, as is #26's preplan, STYLE.md and TODO.md). Commit prefixes come from PROCESS.md's table only (`api:` for an entry point, `client:`
  for the React package). Main-checkout moves have been the owner's each time (another agent's
  work becoming #30; a rebase of `20261015-roadmap_fruit`): reviewers report them and judge.
  Slots count builders, not reviews.
