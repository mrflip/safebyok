# Sprint matters -- progress

## Status

| # | Thread            | Status                     |
| - | ----------------- | -------------------------- |
| 1 | hkdf_info         | merged #97                 |
| 2 | release_age       | merged #96                 |
| 3 | passkey_button_ux | merged #98                 |
| 4 | small_sweep       | merged #99                 |
| 5 | vaultdb_battery   | merged #114; the rest to a new sprint (Big Feats Next: 5a trims, 5b helpers sweep) |
| 6 | race_helper       | merged #119                |
| 7 | indexeddb_fixes   | merged #109                |
| 8 | size_rule         | merged with #99            |
| 9 | damaged_bundle    | merged #108                |
| 10 | identity_revoked | merged #106                |
| 11 | vaultdb_contract | merged #107                |
| 12 | postgres_soft_cap | merged #113               |
| 13 | rotation_design  | merged #105                |
| 14 | rotation_shape   | merged #120                |
| 15 | e2e_home         | merged #111                |
| 16 | late_unlock      | merged #110                |
| 17 | validation_note  | not started: unblocked (#101 merged), not in the Coach's next sprints; open |
| 18 | rotation_adapters | to a new sprint (Big Feats Next) |
| 19 | rotation_verb    | to a new sprint (Big Feats Next) |
| 20 | rotation_docs    | to a new sprint (Big Feats Next) |
| 21 | damaged_erase    | merged #115                |
| 22 | flake_fixes      | merged #118                |

**Closed 2026-10-16.** The plan for 18-20 and 5's remainder is the doc's *Big Feats Next* tab;
the Coach launches them as new sprints. Open questions: the doc's *Open Matters* tab (eleven rows).

## What the threads have taught

* **The line, restacked onto main `5090c1a`** (after #99's merge): #98 f383865, #97 5ff4dc0, #105
  b16d15b, #106 9aef481, #107 3f1449b, #108 85cb18d, #109 06f4f37, #110 d0d6fb5 (top). Trees
  byte-identical. The "mainly main" ruleset requires test-build, lint-typecheck and both CodeQL
  checks, with **strict up-to-date**: every PR goes BEHIND whenever main moves, and merging the top
  takes all. #107's test-build hit the Convex timeout flake twice; rerun requested. **The whole line
  merged with #115 (main `23f263a`). The line now: main `cc32761` → #111 → #119 → #120 (top), restacked after the gripes line merged; justify green at the top.**

* **Thread 21 (#115), damaged_erase.** `eraseDamagedVault(opts)` erases a vault `openVault` refuses
  as `damaged_bundle`, and the device's remembered unlock; a sound vault is refused (`bad_option`),
  nothing erased. A new base-class verb `VaultDB.eraseDamagedVault(scope)` reads the stored record
  for its `vault_id` and aims `doEraseVault` at it (a vault made anew meanwhile survives as
  `stale_write`). `localVaultDB`/`idbVaultDB` now erase a vault on `vault_id` alone (VAULTDB.md 3.5).
  React: `useVault().eraseDamagedVault()`; the demo offers "Erase and start over". Proven on local,
  IndexedDB and the base class only (Convex/Postgres rows can't be damaged this way; GraphQL's
  server validates first). *Review: flagged.* A device on an older build would call a newer
  bundle (new `format`, unlock `method`, or more than `MaxUnlocks`) damaged, and its hatch would
  erase a vault every up-to-date device opens. *Orchestrator (YOLO, two-way, narrowing a
  destructive call):* resumed with a directive -- the hatch refuses what may be newer ("update the
  app"), fails safe where newer and damaged can't be told apart, and `notes/security.md` records the
  rule that any stored-shape change bumps `format` (to the Coach as a matter). Also: the provider
  reopens after `bad_option`/`stale_write`; the hatch goes through `RefusalPolicy.heed`.
  *Second review: clean.* `mayBeNewer` refuses unknown format/method/count; zod strips unknown keys,
  so extra fields read sound. The rule must be broad -- "any change to what a stored record may
  hold, a field, a shape, or a range a check accepts, bumps `format`" -- or relaxed checks under
  the same format still read as damage (the Coach's row). Declining `heed` is sound (no handle, no
  key). Left: erase aims at `vault_id` only; "may be newer" shares `damaged_bundle`.

* **Thread 5 (#114), vaultdb_battery.** Audited all five adapters; did all but Convex here. New
  battery tests: 1.1/1.2 (text never normalized), five races under 3.2-3.5, a `pushes: true` option
  for 6.1 (wired for local, IndexedDB, Postgres, GraphQL); `makeVaultDBFor` on the Postgres route
  and GraphQL Yoga recipes; duplicates trimmed. The recipes' test-only `x-test-user` header is now
  URI-encoded (a header holds only Latin-1). **Convex gets no capped factory** (its 8000 limit is a
  constant inside the component; no honest way to lower it). **Proposed split for the rest:**
  Convex after #111's ruling (add `pushes`, trim duplicates); Postgres's cap duplicates after thread
  12; a helpers sweep (`TH.expectRefusal`, `eventually`/`changeCounter` into `safebyok/testing`).
  **For thread 6:** a second-device factory (two adapters over one backend, no shared connection or
  lock), writers that really overshoot (4.5), and a way to know a watch is live (to retire
  `watchSettled`'s 50 ms guess). *Review: clean*; nothing lost in the trim; each new test caught a
  scratch break. Left for thread 6: push tests count "more calls than before" with one tick for a
  leaked listener -- an adapter pushing twice or late could slip past.

*Orchestrator (~02:40Z):* the Coach merged #99 expecting the line above it to go too; a merge
takes only what is beneath. At the Coach's word ("restack any other prs on main so that closing
the top makes them all go purple"), an agent restacks #98 to #110 onto main `5090c1a`. **#111 is
held**: the Coach finds moving Convex's whole suite to `e2e/` wrong ("I'd want to have the test
suite local"; `e2e/` is for N×N client-adapter checks and Playwright) and asked for options, not a
rewrite -- they're in the Open Matters row, Rec (b): a test-only `safebyok-convex/testing` entry
for the fake, `e2e/` running only the React half.
* **Thread 12 (#113), postgres_soft_cap.** One lock-free insert, classified from one snapshot;
  `lockbox_count`, its trigger, `FOR UPDATE` and `StillFullSql` gone; `VaultNotifySql` opt-in
  (shipped as `vault-notify.sql`); README states the guarantee at READ COMMITTED and offers a
  "vaya con dios" hard-cap trigger (its refusal reads `storage_unavailable`). For thread 14: the
  `vault` CTE in `InsertBoxSql` is where a `FOR SHARE` bundle read goes; `ReplaceBoxSql` would need
  a bundle join.

* **Thread 11 (#107) filed** on #106, landing second, so it wrote #106's lines in: 5.4 (another
  user or nobody is refused every verb as `identity_revoked`, tested through a new
  `makeVaultDBFor` option on Postgres, GraphQL, Convex and `servingOnly`), 5.5-5.7, and #106's
  watch line as **6.2** (beside `subscribe`). 5.3's groups merged; 4.4 retitled.
* **Thread 15 (#111), review clean.** 126 Convex tests before, 123 in `e2e` + 3 kept after; the moved
  tests still catch a broken adapter. Left: no coverage report now measures `convex-vault-db.ts`
  (with the Coach's ruling on the move); stale comments listing only `packages/` and `demos/`.
  **A flake seen:** `safebyok-react`'s `vault-provider.test.tsx` ("an action through
  withUnlockedVault summons the dialog...") failed once under a parallel justify, passing on rerun;
  and the demo's `answerPassphraseDialog` ("unlocks a locked vault through the dialog...") once
  at thread 9's filing. Both are dialog tests under load: a candidate for a small thread.

*Orchestrator (~02:10Z):* the Coach merged #99 (taking #96 with it); #98, #97, #105 and #106 sit
above it, so they stay open until the Coach merges the line's top. **Filing is serialized**: each
filer rebases onto the top the one before it left, so the line stays one line. Order: 11, 9, then
7, 16, 15 as their reviews return. *Review* of 11: fixed one (4.2 now compares the whole vault
after a `vault_full`); the Postgres verdict holds as reasoning (at REPEATABLE READ racers don't
`40001`; only SERIALIZABLE). 4.4 retitled "Under the limit, a new lockbox lands". 11 writes #106's
five lines in, being second. *Review* of 9: fixed two (a mixed-deriver message no longer says every
passphrase is damaged; `askPasskey` skips a passkey whose salt isn't 32 bytes); no bypass or
downgrade found. *Review* of 7: fixed one (`settle` kept a failed request's real error, which
bubbles to the transaction while `transaction.error` is still null); the key range holds exactly
the vault's lockboxes (JSON strings self-delimit). Noted: a worker used `git stash`, which every
worktree shares -- now a ground rule against it.

* **Thread 7 (#109), indexeddb_fixes.** `listBoxes`/`eraseVault` read `boxRange(scope)` (an
  `IDBKeyRange` over the tuple-JSON lockbox prefix) instead of the whole shelf; every request goes
  through `settle()`, so a null `request.error` becomes an Error and no `cause` is ever null; the
  bell closes its channel when the last listener leaves. Stored keys unchanged -- the Coach's
  "anything deeper?": no. *For threads 5 and 6:* vitest's `rejects.toThrow(/re/)` passes on a
  `null` rejection; a null-cause test needs an explicit `instanceOf(Error)`.

* **Thread 11 (#107), vaultdb_contract.** The contract is `packages/safebyok/VAULTDB.md`, 26
  numbered lines; `describeVaultDB` runs a group per line, titled `..., 3.3: <line>`, and
  `TH.VaultDBContract` is held to the doc by a drift test. Owners: the adapter does the atomic
  compare-and-write, the base class turns `false` into `stale_write`, the vault reads before and
  retries after. Limit lines (4.2-4.5) run given `{ makeCappedVaultDB }` (Postgres, GraphQL,
  `MapVaultDB`; **Convex not yet -- thread 5**). Lines 5.5+ are reserved for #106's five
  `identity_revoked` lines: whichever lands second writes them in. Race lines check outcomes only;
  **thread 6 proves the race**. Departs from the Coach: a write returns no count (a matter row).
  **For thread 12** (`thread-11-postgres_verdict.md`): the one-statement insert meets the contract
  at READ COMMITTED if it reports why it missed in the same statement (CTEs over one snapshot),
  maps FK `23503` to `stale_write`, and the README names the isolation level (`40001` above it);
  racing writers may overshoot by N-1. Rotation (thread 14) will need a statement-scoped
  `FOR SHARE` on the bundle row. *Orchestrator:* the NOTIFY trigger becomes opt-in in thread 12,
  by the Coach's own baseline (nothing beyond tables and indexes unless the host opts in).

* **Thread 13 (#105), rotation_design.** Design in `whiteboard/20261016-rotation/rotation-design.md`.
  "Re-wrap the remaining envelopes" is impossible (an envelope's key is a passphrase or a passkey
  touch the vault never keeps), so rotation keeps only the ways in proven during it and removes the
  rest; a key pair per way in (HPKE) would be new cryptography -- **the Coach's call, an Open
  Matters row, gating thread 19**. One atomic bundle write commits the new vaultKey (with the old
  one wrapped under it), then a resumable walk re-encrypts lockboxes by conditional writes; needs
  one new contract line, `LockboxExpectation.vault_key_epoch`, compared atomically by every adapter
  (thread 11 should carry it). Today a restored older bundle brings a removed way in back: the
  design adds a device mark and a `rolled_back` refusal. NOTYET data: a per-vault random
  `device_id` on each envelope. The build: 14 rotation_shape (opus), 18 rotation_adapters
  (sonnet), 19 rotation_verb (opus), 20 rotation_docs (sonnet). The `openVault` leak was never in
  TODO; first-emit struck. *Review:* none, documents only.
* **Thread 10 (#106), identity_revoked.** `identity_revoked` (the opened-for user is gone) beside
  a narrower `not_permitted`; `src/refusal-policy.ts` decides (lock by default; nothing stored is
  erased); `openVault({ whenIdentityRevoked: 'lock' | 'stay' })`; Convex and Postgres refuse a
  signed-out or other user as `identity_revoked`; Convex's failed watch now calls `onChange`. Its
  thread file holds five lines the VaultDB contract should carry (threads 11 and 5). Size: 245 B
  over main's budget, inside the line's (#99). *Review:* fixed two -- `rememberedUnlock` now
  yields to a shut since it began (a refresh meeting `identity_revoked` mid-open left the open
  `unlocked` holding the dropped key), and `heed`'s pass-through is tested for all eight verbs.
  Left, minor: a read past `ensureUnlocked()` still returns its whisper if a lock lands mid-read
  (always so; to the Coach); a never-settling device erase hangs the refused call; a closed
  handle's late refusal erases the remembered unlock; every ConvexClient watch error refreshes.
* **Thread 9 (#108), damaged_bundle.** `damaged_bundle`, `damaged_unlock`, `damaged_lockbox`: the
  vault translates storage's `corrupt_record` (kept as `cause`), so no adapter or contract
  changes. A damaged way in is passed over, not a lock-out. A tampered bundle still reads as
  `wrong_passphrase` (AES-GCM can't tell), with "the stored vault may be damaged" in the message;
  the plan's "remembered unlock" example was refused as a home-made construction. Argon2 sentence
  in security.md. Open: a damaged bundle can't be destroyed (no handle opens); VOCABULARY's
  *damaged* row could widen; #106 meets it in `errors.ts` at restack.

* **The restack (#96 to #99 onto `b60e516`).** One line, bottom to top: #96 `34171fd`, #99
  `88b7b05`, #98 `4eb2d74`, #97 `8d665aa` (#97 on top: it rewrote `vault.ts` logic main also
  rewrote). Justify green at the top (core 1144 tests). Repairs: tests moved to main's tuple ckeys
  (`isU1Box`, `u1BundleCkey`); #98's dialog kept around main's version, which dropped the
  `reentryHours` prop for `vault.reentryWindowMs`, so #98's three bad-`reentryHours` tests went with
  the prop. `.size-limit.json`: main's two new entries (validators 8.5 kB, DefaultValidators 4 kB)
  predate the rule; validators measures 8.15 kB, so a thread that grows it widens it by the rule
  (about 12 kB). **New threads stack on the line's top: now #110** (main, with #96 and #99 merged, →
  #98 → #97 → #105 → #106 → #107 → #108 → #109 → #110). Local tags `<branch>-prerestack3` hold the old tips.

*Orchestrator (2026-10-16 ~01:35Z):* the previous orchestrator session ended mid-sprint; threads
9, 10, 11 and 13 stopped with nothing committed (9 and 10 left work in progress in their
worktrees). The gripes line merged meanwhile (main `b60e516`). 10, 11 and 13 resumed on it; 9
resumes once #97 is restacked.

* **Thread 8 (#99), size_rule.** Budgets by the written rule, now in PROCESS.md's *Size budgets*:
  measured + 3 kB at 5 kB and over, + 50% (at least 1 kB) under, rounded **up** to two significant
  figures (everything 30, openVault 23, stableJsonify 3.5, mask 8.8 kB). The sprint skill says the
  orchestrator guesses a sprint's target up front and a late thread lowers the budgets. *Review:*
  none, budgets and docs only. Left: three small budgets fell (stableJsonify 6 to 3.5 kB); a later
  thread that outgrows one widens it by the rule. The 5 kB line is a cliff (argon2idWebV1Deriver).
* **Thread 3 (#98), filed.** The Coach's rulings (swap kept; hand-written boundary kept) are in its
  body and thread file. Second review clean over the review round. *Review:* left, minor: a late
  unlock leaves a newer dialog asking over an unlocked vault (a design call, for the Coach); narrow
  races (a lock between unlock and retries; `vault_locked` while `vault` is null); `role="alert"`
  mounted with its text (with #90's markup); Escape not stopping propagation; shadow-root focus.

*Orchestrator (part 2, 2026-10-16):* a new orchestrator session took over in YOLO; see the plan's
*Part 2*. Thread 3's worker finished its review round (`60bc87e8`, pushed to #98) before the old
session ended; it never filed, so a second reviewer and a fresh worker finish it. The
`convex-test@0.0.61` exclusion (thread 2) ages at 2026-10-16T23:01Z: the first thread to file after
that removes it.

* **Thread 2 (#96), release_age.** Seven days, strict; the lockfile re-resolved, ten floors lowered
  to aged releases, the big_feats hand pins retired. One exclusion, `convex-test@0.0.61`, ages at
  **2026-10-16T23:01Z**: whoever touches the line after that removes it (the PR says how). Every
  later thread: a dependency floor must name a release at least seven days old, or the frozen
  install fails. *Review:* fixed one (the exclusion's expiry was a date, not a time); left as minor
  the caret-on-0.0.x cosmetic, Dependabot security updates bypassing the cooldown (by design,
  PROCESS.md), the days-vs-minutes skew, and dist byte-identity after tsdown 0.23.1 -> 0.23.0
  (unchecked).
* **Thread 4 (#99), small_sweep.** Budgets now measured + 3 kB (openVault 23, everything 30):
  wave 2 inherits the room. Most of TODO's sand was already fixed on main. *Review:* clean; left
  the empty changeset for a README-only change as the Coach's call, and noted that +3 kB loosens
  the small budgets (stableJsonify 2.3 of 6 kB).
* **Thread 3 (#98).** The plan's gloss was wrong: on main the passkey button already threw misuse
  to the host's boundary, like the dialog. Its hand-written 10-line boundary class is a matter for
  the Coach (library-first), as is the dialog swapping its form for a notice.
* **Thread 1 (#97).** Bound every written field it could find: the passkey's HKDF info is its
  wrap's whole binding; envelopes bind `registered_at`; lockboxes their whole public header; a
  remembered unlock its deadline. Pulled roadmap 3's "every field in the binding" forward for
  lockboxes (thread 4 noted it in TODO). *Review:* fixed two overclaims in docs (security.md
  missed `method`; "every field" wasn't, since `unlock_epoch` and the unlock list stay unbound);
  confirmed the encoding is injective, info = AAD is sound, and nothing that changes without
  re-encryption is bound. Left: a tampered bundle reads as `wrong_passphrase` (now a matter); an
  `undefined` binding part drops silently; the lockbox format is bound twice. The Argon2
  derivation stays unbound (a matter).
* **Thread 3 (#98), flagged.** A bug on main, not the thread's: `withUnlockedVault` hangs on an
  unmount or an overlapping ask, and on a user switch the dialog returns over the next user's
  vault holding the old user's settle. Resumed (normal mode, but the Coach's "productionized"
  answer covers it) with the fix and the passkey button's focus and live region.

*Orchestrator:* for `/turbochat`, learned while running it: a new table row goes in as blocks
(`insert`, `"as":"blocks"`, a `row` of `cell`s, at `side: "end"` of the table), with placeholder
text in each cell; then each placeholder paragraph is replaced with markdown that carries its chip.
A markdown row inserted after a row is refused (`shape_mismatch`). The doc mirror of this sprint is
a status tab linking to these files, not a full copy: the doc takes only inline text, and
re-sending the plan whole costs more than the Coach's token budget wants. After inserting rows,
their cells' ids follow the row id in order (row r: cells r+1, r+3, r+6; their paragraphs one
after each), so the fill needs no read.

*Orchestrator:* **housekeeping, for the Coach.** The Coach approved a first pass, but this
session's permission check refused the deletion, so a read-only survey (2026-10-16 00:46Z) found
what is certainly safe. Run from the Mac's or container's shell:

```sh
git -C /workspace/byok worktree remove /workspace/byok-convex
git -C /workspace/byok worktree remove /workspace/byok-staged-publish
git -C /workspace/byok worktree remove /workspace/byok-whisper-cap
rm -rf /workspace/byok-comment_width /workspace/byok-convex_component /workspace/byok-unlock_envelopes /workspace/byok-react_publishable
git -C /workspace/byok worktree prune
```

Not certain, so kept: `byok-strict_configs` (on `20261015-testing_entry`, PR #38 closed; four
local commits not on origin, two differing in patch-id from their rebased copies);
`byok-passkey_unlock` (work reachable only from local `*-prerestack2` tags); `byok-rebase` (matches
no branch); `byok-test_helpers` and `byok-storage_verbs` (older committed versions only, probably
safe); `byok-kdf_configs`, `byok-gripe_rulings`, `byok-replaceable_validators`, `byok-hkdf_info`,
`byok-vault_amendments` (touched within six hours, or the gripes session's). Never
`byok-restack`, `byok-docs_housekeeping` (yours, from the Mac) or `triquet`.
