# Sprint `fixup_sprint`: plan

* **Date:** 2026-10-27.
* **Mode:** normal.
* **Review level:** `medium`.
* **Threads at once:** 3.
* **Issued by:** the Coach (flip), in the session that wrote `fixup-preplan.md`.
* **Status:** done. Every thread filed, restacked into one line: main → #297 → #299 → #298 →
  #300 → #303 → #304 → #302 → #295 (justify green at the top, `2a3bc832`). The open questions are
  in the sprint doc and `human/20261027-sprint_fixup_sprint_done.md`.
* **Sprint doc:** https://claude.ai/artifact/Qvwd1KJxaAJKZtMtgaMNBg (project
  `c1ca452e-aee4-4408-8f1b-0dbfab9cffaf`). Its tabs are Open Matters (`d2c7fb21-9f41`, body
  `08842204-eea3`), Cleanup (`a7071431-c56b`, body `7972c2d6-09f7`), Progress (`071f7f7e-aae6`,
  body `86fa9d65-1e5f`) and Resolved (`630d659a-da81`, body `a5b56f19-aedb`). The State enum is
  `f86ea45e-9957`.

The Coach's request, verbatim:

> can you start a thread including your work and the un-standing (seen now also int he fixup
> folder)?
>
> I was unclear I meant start a /sprint and to use the /turbochat skill

The rulings the plan rests on, verbatim (2026-10-27):

> I prefer DeviceDB as a class, if it won't cause any new problems
> All the proposals you said make sense, put them in the plan.

> I'm inclined to leave the checks if there's a question.

## Sources

The specification is three files beside this one, copied from the Coach's local branch
`20261027-fixup` (`whiteboard/20261026-fixup/`):

* `fixup-preplan.md`: items 1 to 8. This sprint builds items 1 to 5 and 8.
* `unstanding.md`: the `retire_standing` brief.
* `fixup-changes.md`: the Coach's questions the preplan answers. It's background only.

Items 6 (`type` over `interface`) and 7 (`function` declarations outside React) are not in this
sprint. Each edits STYLE.md and the lint config in a PR of its own, and item 7 waits until this
sprint has merged.

## Read first

* `fixup-preplan.md`: the items your thread builds, whole, and the introduction.
* STYLE.md: *Naming*, *Build for maintenance*, *Comments and doc blocks*, *Tests*, and *Shapes
  and duck typing* for item 4.
* VOCABULARY.md, for any name you add.
* PROCESS.md: *Threads*, *The history we keep*, and *Packages* for changesets.

## Ground rules

* **The preplan's line numbers are as of `da294a43`.** On `origin/main` they sit about ten lines
  later, and may drift more. Find each site by its name, not its line.
* **Where there is a question, the check stays** (the Coach, 2026-10-27). Remove a check
  (a demand, a validation, an answer's guard) only when it is provably vacuous: for example, a
  demand on a thing made from the vault record in hand, with nothing between them. When removing
  one raises any doubt, keep it, and put the doubt in your report's *Open matters*.
* **The demand model.** Demand `demandConsistentWith(thing)` synchronously, before the first
  junction and after each one. Chains add none. Never a bare `demandConsistent()`.
* **One changeset per thread**, `.changeset/20261027-<label>.md`, `minor` where an export
  changes (PROCESS.md, *Packages*). Each says what a host changes.
* **notes/security.md is written only through a `sonnet` subagent** (its header says how); don't
  read it yourself. Threads 1 and 3 each change something it records.
* **Name the operation**: say `getBox`, `doPutVaultRecord` or `lock()`, never "the read".

## Threads

### 1. `outcome_default`: preplan items 1, 2 and 3

> All the proposals you said make sense, put them in the plan.

`fixup-preplan.md` items 1, 2 and 3:
* `outcomeOf` defaults to `unexpectedError`, and `answering` goes.
* `adapterAnswer` drops its Outcome check and its `hookname` parameter.
* `unexpectedError` moves to `refusals.ts`.

**Gloss.**
* **Touches:** `src/outcome.ts`, `vault-db.ts`, `refusals.ts` and `index.ts`; the `outcomeOf`
  callers in `bank.ts`, `box.ts`, `lease.ts`, `proving.ts` and `vault.ts`; `tests/outcome.test.ts`,
  `tests/vault-db.test.ts`, and `safebyok-react/tests/test-helpers.ts`; the core README's refusals
  section.
* **Depends on:** nothing. Cut from `origin/main`.
* **Size:** small.
* **A start exists:** before the sprint, the orchestrator built item 1 by hand. The edits are
  untested, and are at `<scratchpad>/outcome_default/step1.patch`, against `0d3b5a57`, whose
  `packages/` match `origin/main`.
  - Apply it with `git apply --3way`, check it, and make it yours.
  - Rename its changeset to the thread's.
  - It already rewrote outcome.ts's examples and their tests for the new default.
* **Look-ahead, item 2:** `tests/vault-db.test.ts` has "refuses a write answered with a refusal
  still wrapped, which reads as true, rather than taking it as landed". That test uses
  `ForgetfulVaultDB`, whose `doPutVaultRecord` and `doDelVault` resolve `bad(...)`.
  - Before removing the check, prove that without it each such answer still refuses: for
    example `corrupt_record` from `checkAnswer`, never a write taken as landed.
  - If any verb would take a wrapped refusal as landed, the check stays (ground rules), and you
    raise it.
  - Rewrite that test, and the `bad_option` test beside it, to assert what now happens.
* **Look-ahead, item 3:** `isOutcomeShaped` stays in outcome.ts for now. Its last caller is
  `guarded` in `device-db.ts`, which thread 3 deletes, along with `isOutcomeShaped`. Don't touch
  device-db.ts.
* **security.md:** it says the one catch, `outcomeOf`, makes a `storage_unavailable` with its
  cause. Have a `sonnet` subagent update that passage to the new default.

*Review:* flagged, then ruled ([#297](https://github.com/mrflip/safebyok/pull/297)).
* **The reviewer fixed two things:** `bank.ts` and `vault.ts` now call `Refusals.unexpectedError`
  (STYLE.md *Imports*), and the `VaultDB` class doc no longer promises `bad_option` for a
  wrapped answer.
* **Significant:** a wrapped `doGetBox` answer lets `putBox` overwrite a sound box as damaged,
  dropping its sidecar.
  - *Coach (2026-10-27):* "Don't defend against a future programmer writing bad code by writing
    bad code in a critical path. If that's what's happening here, remove the check." It was.
  - The check stays removed. The worker confirmed `describeVaultDB` fails such an adapter at its
    first box read (29 tests).
* **Minor:** a wrapped `bad(vault_mismatch)` reads as `damaged_box`. That has the same cause, and
  goes the same way.
* **Minor:** the double export. *Coach:* keep both.

### 2. `vault_params`: preplan items 5 and 8

> All the proposals you said make sense, put them in the plan.

`fixup-preplan.md` items 5 and 8:
* Item 5: the parameters every caller fills from the object's own state (a to e).
* Item 8: functions that don't pull their weight, and logic that should be one function (a to e).
* What 5f and 8f keep stays.

**Gloss.**
* **Touches:** `vault.ts` (the box read and write path, the lease take-up, the lease-in-force
  checks, `#damagedBase`), `proving.ts` (`#unwrap`), `gating.ts` (`#gatedOf`), `bank.ts`
  (`vaultPartsOf`), a new `src/text.ts` (`codePointsOf`, `byCodeUnit`), `mask.ts`,
  `zxcvbn-strength-checker.ts`, `vault-db.ts` (the `byCodeUnit` export), and their tests.
* **Depends on:** thread 1. They rewrite the same lines in `vault.ts` (`#readBox`'s and
  `#storedBase`'s `outcomeOf` calls) and `bank.ts`. Cut from thread 1's tip once it files, and the
  PR says "Stacked on #N".
* **Size:** medium. This is the largest code thread.
* **Look-ahead:**
  - Thread 4 renames what is left of "standing" afterwards. So name every new member without it:
    `#leaseInForce`, not `#leaseStands`.
  - 5b's two demands after `#boxUnder` are vacuous and go. `#storedBase`'s repeated
    `#demandAfterWait` stays, by the ruling.
  - 8c's `#fittingLeaseOf` is the builder's call.
* **Size budgets:** no line should move.

*Review:* fixed ([#299](https://github.com/mrflip/safebyok/pull/299)).
* **The reviewer fixed two things:** `tests/text.test.ts`'s combining marks are escapes, so they
  survive NFC; and `#readBox`'s and `#updateBoxListingOf`'s doc blocks name the operation.
* **It confirmed** that both removed demands are provably vacuous, and that every drop of an
  ended lease is kept exactly.
* **Minor, left:**
  - `#leaseLastsPast` doesn't use `#leaseInForce`; it adds `fitsLease`, which the preplan kept.
  - The two drops of an ended lease are written the same way.
  - An inline sort duplicates vault-db.ts's `byBoxlabel`.
  - `#freshGatedRecord` lacks a verb: thread 4 renames it.
  - Three over-long doc lines: thread 5 takes them.

### 3. `device_db_class`: preplan item 4

> I prefer DeviceDB as a class, if it won't cause any new problems

`fixup-preplan.md` item 4, whole: DeviceDB becomes an abstract base class, as VaultDB is, under
the three constraints listed there. It fixes the idb device-record race and adds a conformance
test for it.

**Gloss.**
* **Touches:** `device-db.ts` (the class, `deviceOutcomeOf`, `deviceTroubleAsConditions` and
  `guarded` gone), `idb.ts` (`idbDeviceDB` a subclass, its conditional discard as the hook), the
  memory store, `vault-opts.ts` (`parseDeviceDB` by `instanceof`), and the three
  `deviceTroubleAsConditions` users (`bank.ts`, `vault.ts`, `del-damaged-vault.ts`).
  - Also: `outcome.ts` (`isOutcomeShaped` deleted), `index.ts` and `idb` entry exports, the test
    worlds' object-literal stores, `describeDeviceDB`, and the core README's custom-DeviceDB
    section.
* **Depends on:** nothing by lines. Thread 1 also edits `outcome.ts`, but in other blocks; the
  restack resolves any conflict there. Cut from `origin/main`, alongside thread 1.
* **Size:** medium-large. It changes the public surface.
* **"No new problems" is the condition.** If building it surfaces a problem the preplan's checks
  missed, the thread stops at that point and raises it as a blocking question. It doesn't design
  around the problem. The three constraints are hard requirements:
  1. Each hook is called synchronously, before any `await`.
  2. An unreadable row is discarded atomically by the store, and only while it still won't read.
  3. `raiseDeviceRecord` is one atomic read-modify-write in the store.
* **Contract:** the changeset is `minor`, and says how a host's own DeviceDB becomes a subclass.
  The README example must read as production code.
* **security.md:** have a `sonnet` subagent record two things: the discard rule, now one
  conditional discard for both records, and the race it closes.
* **Size budgets:** `idbDeviceDB` (28.2 of 32 kB) and `browserOpts` (33.8 of 37 kB) may move.
  If the rule gives a line another budget, run `pnpm size:budget --write`.

*Review:* fixed ([#298](https://github.com/mrflip/safebyok/pull/298)).
* **The reviewer fixed three things:**
  - two test doc blocks' first lines;
  - the README's own-store example, which recreated its object store on every upgrade;
  - a doc link to the now-private `raisedDeviceRecord`.
* **Its minor findings, by disposition:**
  - The two vacuous "touches no device store" tests, the false name `uncheckingDeviceDB`, and
    the `world.ts` leftovers: fixed by the worker in `5586d61d`.
  - The lost verb guard: Open Matters.
  - security.md's "`deviceOutcomeOf` gone": Cleanup, at the restack.
  - The rest ride in the PR comment: unchecked `putLease` inputs (decided), the weaker
    logger-leak plant, the narrower `doDelUnreadable` type, `#readableOf`'s name, the untested
    `@example`s, the class doc's repetition, and the stale VOCABULARY.md row.

### 4. `retire_standing`: the unstanding brief

> can you start a thread including your work and the un-standing

`unstanding.md`, whole.

**Gloss.**
* **Touches:** nearly every file in `packages/*/src` and `tests`, plus `VAULTDB.md`, the READMEs,
  `e2e/`, `demos/`, VOCABULARY.md, TODO.md and `notes/old_vocabulary.md`.
* **Depends on:** threads 2 and 3, both of which delete or rename identifiers it would otherwise
  rename. Restack threads 1, 2 and 3 into one line (`wrapup.md`, *Restack*), then cut from the top
  of it.
* **Size:** medium, mostly mechanical. The prose needs rewording, not word swaps, so it keeps the
  default model.
* **Look-ahead:**
  - The brief's table names a few identifiers that threads 2 and 3 may already have removed or
    renamed: `#unlockStands`, `leaseStands`, `#checkStanding`, `#boxUnder`'s callers. Rename
    what is left.
  - The done-when grep in `unstanding.md` is the check.
  - *Orchestrator:* rename gating.ts's `#freshGatedRecord` (thread 2's) to `#freshenGated`, so
    its verb says it reads storage through `freshen`; its review asked for it.
  - Leave notes/security.md to a `sonnet` subagent, as the brief says, and name it in the PR's
    open questions.

*Review:* [fixed](https://github.com/mrflip/safebyok/pull/300#issuecomment-6452564329), 4 fixes,
0 significant. Fixed: `#putGate`'s comment (the store adds one to the *stored* epoch, not the held
one); `tryExtractWhisper`'s comment names the demand's lease half; `#storedBase`'s "where no box is
stored"; security.md's first-gate race entry (the loser's `gate_made_elsewhere` comes from the
consistency demand, not `#demandNotGone`). Left, minor: `#raiseRecordAfter`'s log keeps "what it did
stands" (kept idiom); graphql's `refusalOfAnswer` doc block names `storedField` (pre-existing shape);
`OutsideGating` sorts out of order in four test imports; `MapVaultDB.storedVaultRecord` is a noun
for a read (pre-existing); `#freshenGated` kept as ruled; the empty changeset and `OutsideGating`'s
home are in the doc.

### 5. `docblocks_core`: a documentarian run on the core's `src/`

> Would you please add a thread to run it agains the core src/ directory?

(The Coach, 2026-10-27, in the sprint doc, on the documentarian's earlier vault.ts run in
`stash@{0}`: "the documentarian run was mostly for evaluating documentarian. Ignore it.")

**Gloss.**
* **Target:** `packages/safebyok/src/`, every doc block, by the `documentarian` agent
  (`.claude/agents/documentarian.md`), not a thread-worker. Doc blocks only: behaviour, names and
  the code of `@example`s stay.
* **Split, by size:** about 11,000 lines in about 50 files is too long for one context. So it
  runs as three documentarian runs on disjoint files, each its own PR and `human/` entry:
  - **5a**, `vault.ts` alone, which is about 2,000 lines;
  - **5b**, storage and refusals: `vault-db.ts`, `local-vault-db.ts`, `expectations.ts`,
    `device-db.ts`, `idb.ts`, `idb-opts.ts`, `refusals.ts`, `errors.ts` and `outcome.ts`;
  - **5c**, the rest of `src/` and `src/checks/`.
* **Depends on:** every other thread. It runs last, over the code as the sprint leaves it, so no
  rewritten doc block is churned by a later rename. The three runs touch disjoint files, so they
  run side by side, each cut from the top of the restacked line once thread 4 files.
* **Size:** large in total, mechanical in kind. Each run reports its doc-block line counts.
* **Look-ahead:**
  - Thread 4's names, with no "standing".
  - Thread 3's DeviceDB class doc, which its review found repeats the per-verb blocks.
  - Thread 2's review: the first lines of `#freshenGated` (gating.ts) and `Proving.#unwrap` run
    35 to 45 words, and `#damagedBase`'s second line says how it's built, not what it does.

*Review, 5a ([#304](https://github.com/mrflip/safebyok/pull/304)):* [fixed](https://github.com/mrflip/safebyok/pull/304#issuecomment-6453476949),
7 fixes, 0 significant. The run's three corrections to match the code hold. Fixed: the class-wide
lock bullet names only the calls that need the vault unlocked, and says "writing nothing more"
(a gating's attempt may already have stored its change); three dropped facts put back (the
Outcome's shape and the `try` form, `ask_passphrase_at`'s cue, putBox's `written_at` stamp);
getBox's 'vault_remade'; putBox's two 'stale_write' cases kept apart; who drops an ended lease;
four VOCABULARY.md words; three private consts as plain code. Left, minor: `#storedBase` →
`#fillFromStored` (Your calls); `#demandLease`'s noun first line; `lock()`'s "Forget the unlock"
(Finally); the bank-only symbols name their caller; two message bugs (Finally).

*Review, 5b ([#302](https://github.com/mrflip/safebyok/pull/302)):* [fixed](https://github.com/mrflip/safebyok/pull/302#issuecomment-6453340797),
5 fixes, 0 significant: `maxRecordBytes` names putBox's `box_too_large`; `readVault` hands back no
tombstone; `BoxExpectation`'s null `revision_tok`; DeviceDB's 'bad_scope' "each but `delAll`";
`valOf` is the throwing form, not outcomeOf's inverse. Left, minor: `delBox` takes only null as
stale (a row); the verbs no longer say a failing record is discarded (the class doc does);
`doRaiseDeviceRecord`'s transaction wording; idb.ts's top block lacks `@module`; the README's
`whisper_too_large` and `storage_blocked` rows (rows); the renames (rows).

## Order

* Threads 1 and 3 run at once, from `origin/main`.
* Thread 2 is cut from thread 1's tip once thread 1 files.
* Thread 4 waits for the restack of threads 1 to 3.
* Thread 5's three runs (5a, 5b, 5c) wait for thread 4, then run side by side.
* The sprint PR joins the line last, on top.

## For the Coach

* **Your local branch `20261027-fixup`** carries four commits found nowhere on origin:
  `654c9316`, `5d24e8b9`, `e0b84048` and `0d3b5a57`. They hold `whiteboard/20261026-fixup/`,
  which this sprint has copied, and `human/20261027-docblocks_vault.md`. Once this sprint PR
  lands, drop that folder from the branch before you file it.
* **The documentarian's vault.ts doc-block rewrite is in `stash@{0}`** of the base checkout
  (`WIP on 20261027-fixup`). If it is to land, land it before thread 2 is cut, or after thread 4.
  Threads 2 and 4 rewrite the same vault.ts members.
* **#289 (security_notes) is open and edits notes/security.md.** Threads 1, 3 and 4 each have a
  subagent edit that file, so expect conflicts at the restack.
