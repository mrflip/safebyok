# Sprint reform: done (2026-11-06, 19:45)

Twenty-two threads in a day, from the Coach's list of nine plus what the day added: the kind values smushed, a
module clock in place of a clock object, a listing's world as a `Pick` of its class, each host function wrapped once
and branded, every checker defined once with its type chosen by its reader, the VOCABULARY and guarantees swept
against the core, the stale examples repointed, `boxListing.hello` listed internal, and the refusal kinds pruned from
doc blocks and tests. Every thread is merged but the top two, which stand in one line on main. The Coach's rulings are
in `whiteboard/20261106-reform/reform-resolutions.md`; the plan and progress files beside it hold the per-thread
record, with each review's fixes and leftovers under the thread's entry.

## The PRs, in merge order

Merged to main today, in the order main took them (the Coach's 08:30 line, then the stack restacked at 18:30):

| Thread | PR | Note |
|---|---|---|
| 1 `vocab_sweep` | #518 | docs |
| 2 `guarantees_pass` | #517 | docs; the reset of the base checkout it owed is still open (below) |
| 16 `utils_mash` | #529 | |
| 17 `browser_entry` | #531 | |
| 20 `kind_promises` | #533 | |
| 3 `example_pointers` | #522 | docs |
| 11 `duck_calibration` | #525 | docs |
| 12 `refusalof_removed` | #526 | |
| 14 `deviceid_label` | #527 | |
| 18 `deviceid_required` | #532 | |
| 13 `guarantees_models` | #528 | docs |
| 4 `hello_listed` | #523 | |
| 15 `list_boxes` | #530 | |
| 19 `utils_port` | #534 | |
| 5 `module_clock` | #535 | |
| 21 `kind_docblocks` | #548 | docs |
| 22 `kind_tests` | #549 | |
| 6 `worlds_picks` | #550 | restacked by the Coach's worker, merged 18:40 |
| 7 `host_branding` | #552 | stacked on #550, merged 18:45 |
| 8 `checkers_once` | #553 | stacked on #552, merged 18:50 |

Still open, the line `main → #557 → #564 → #516`:

| Thread | PR | Note |
|---|---|---|
| 9 `types_ab` | #557 | restacked on main, CLEAN, every check green |
| 10 `kindvals_smush` | #564 | stacked on #557, review clean, minor changeset (`RefusalKind` is `Refusalkind`) |
| the sprint | #516 | squashed onto #564: the plan, progress, resolutions, inventories and this note; merging it merges all three |

Mode was normal, not YOLO: no decision was taken on the Coach's behalf.

## Open for the Coach

* **Open Matters rows still drafting** (the doc's tab): the rest of the unexported surface (a thread after the
  sprint); whether `DefaultLogger` and `DefaultStrengthChecker` are exported; whether the seven phrase-like `...Kind`
  names (`RefusalFamilyForKind`, `listedKindOf`, `namedKinds`, `familyKinds`, `WrongKindCases`, `asKind`,
  `QuotedKind`) are smushed too (thread 10 left them; a one-line sed each).
* **The Closer Look tab's triage** (thread 13's findings): the Coach's.
* **#555** (the vaultdb_cleanup sprint's plain VaultDB) is DIRTY against main and conflicts with #557's tip in
  `shapes-storage.ts` and `memory-vault-db.ts`, and with #564 in `errors.ts` and its test (renamed lines only).
  Whichever lands second takes a rebase; thread 10 changed only the renamed lines in #555's files to keep it small.
* **The base checkout** `/workspace/byok` still sits on `20261104-newdesign_plan` with the Coach's own files
  uncommitted; the reset to main and the one commit of those files is the Coach's (Finally, first item).

## Carried from the Cleanup tab's *Finally*

Landed today and ticked: the stale worktrees, the three stale local tags, the `storable.ts` and `errors.ts` comments,
the `VaultError` example, the clock consts' prose, the whisper-zeroing test, `buildLease`'s `consistent` call, the
dead `whisperTooLarge`/`noRoomForBox` phrases, the `browserOpts()` wording, and `ForeverMillis` (now the cap for a
host's `Infinity`, so no longer unused). Still open, each with the thread that should carry it:

* Two older `bad_whisper` mentions in `notes/security.md` (`box.seal` and `mask` entries): the old-design pass.
* safebyok-react's `askPasskey` doc block still shows `gating.attemptPasskey(passkey)`: when react moves off
  safebyok-old.
* `passkeyAnswer`'s doc block (`shapes-gateish.ts`) says the bytes are zeroed "by the proving sealed of it"; the
  gating's `spendClears` zeroes them: the next documentarian run.
* `bank.test.ts` "logs nothing to the console with a logger of three no-ops" spies `console.warn` only: the next
  thread in that file.
* The values sweep's `ShapeModules` list has a directory check in `tests/helpers/validator.test.ts` now; confirm it
  reads `src/shapes/` rather than a second hand-kept list.
* `notes/guarantees.md` still says all three host guards reach `refusalFor` (three mentions) and quotes five
  incidental kinds: the next guarantees pass.
* `deriver/argon2id-webv1.ts`'s two public derivers have no doc blocks: a documentarian run, with salt-short and
  bad-spec tests.
* `.size-limit.json`'s `mask` entry still measures `safebyok-old/dist/utils.js`: the thread that retargets the size
  budget to the core.
* `notes/gallant.md` shows `this.clock.now()` and `clock = wallClock` in three examples and `PutListingOpts` at :854:
  the next gallant curation (the Coach's #551 terrier may have these).
* A sweep for `consistent(raw, ...)` on unparsed input; `buildLease` was the one case found.
* The vitest `afterEach` clock reset in `shapes-vaultish-listing.test.ts` and `consts.test.ts` takes `_cheat_clock`
  from a world built at module scope: harmless today; the next thread there.
* `brandedVaultDB`/`brandedDeviceDB` name the checker, not the parameter: a minor changeset with the next thread in
  that file.
* The DeviceDB's `leaseQuery` refused a bad scope `bad_option` where the VaultDB refuses `bad_scope`;
  `device-db-new.ts` on the line's tip names neither kind, so check whether #553 or #557 already settled it.
* `tests/shapes/shapes-vaultish-records.test.ts` and `shapes-vaultish-box.test.ts` test the `SX` checks now: rename
  when next touched.
* `PassphraseWayinRecord`/`PasskeyWayinRecord` are minted in `shapes-gateish.ts` while their checkers live in
  `shapes-storage.ts`: a one-line move when `gate.ts` is next touched.
