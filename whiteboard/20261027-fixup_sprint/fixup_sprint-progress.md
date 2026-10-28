# Sprint `fixup_sprint`: progress

What the threads have taught, newer than the plan wherever the two disagree. The orchestrator
alone writes this file.

## Before the sprint

* The orchestrator checked the preplan against `origin/main` at the cut. Every finding still
  holds, but its line numbers sit about ten lines later than the preplan says.
* Baseline `pnpm justify` was green, on `0d3b5a57`, whose `packages/` match `origin/main`.
* Size budgets at the cut, measure against budget, for the lines this sprint may move:
  | Line | Measure | Budget |
  |---|---|---|
  | `Bank` | 54.4 kB | 58 kB |
  | `idbDeviceDB` | 28.2 kB | 32 kB |
  | `browserOpts` | 33.8 kB | 37 kB |
  | `mask` | 24.3 kB | 28 kB |
* `src/utils.ts` is the `safebyok/utils` entry point, so anything in it is exported. Internal
  helpers go elsewhere: `src/text.ts` for thread 2, `helpers.ts` for anything else.
* `asStorageTrouble` stays in vault-db.ts: `startedWatch` is its synchronous caller.

## Thread 1, `outcome_default` (#297): built, review flagged

*Orchestrator:*
* **A wrapped answer is never taken as a landed write.** Thread 1 proved this verb by verb with a
  probe. The write verbs refuse `corrupt_record`, and `getBox` refuses `damaged_box`.
* **But `damaged_box` opens a write in the Vault layer.** `#storedBase` takes `damaged_box` plus a
  given whisper as leave to write the box over as new, dropping its sidecar. So an adapter that
  forgets `valOf` on `doGetBox` alone loses a sidecar silently.
  - This waits on the Coach: keep the check, or have `putBox` write over only boxes the listing
    shows as damaged.
  - Thread 2's `#storedBase` work stands on the answer.
* **`hookname` had 9 call sites,** not the preplan's 11.
* **`unexpectedError` lives in refusals.ts,** exported at top level and as
  `Refusals.unexpectedError`. `bank.ts` and `vault.ts` call it through `Refusals`.
* **Expect restack conflicts with thread 3** in `tests/outcome.test.ts` (around the
  `isOutcomeShaped` describe) and in outcome.ts's imports.
* **Stalls:** worker streams have stalled on long command output. Handoffs now say to pipe output
  through `tail`, and to commit after each milestone.

## Thread 3, `device_db_class` (#298): built, in review

*Orchestrator:*
* **DeviceDB is a base class.** Its hooks are `doGetLease` and the like, and two more:
  - `doDelUnreadable(scopepath, isReadable)`: one conditional discard for both kinds of record.
  - `doRaiseDeviceRecord(deviceScopepath, raisedFrom)`: one read-and-write in the store. The base
    owns the rule and hands it in as the updater.
  The hooks take scopepaths, where VaultDB's take scopes.
* **The device-record race was real.** The new `describeDeviceDB` test failed against main's idb
  store, and passes now.
* **Behaviour change:** the base now discards a host's unreadable lease without a word, as the
  built-in stores always did. Fifteen vault tests were rewritten for it.
* **For thread 2:** `Bank.#bearFrom` and `#revokeLease` no longer take a `deviceDB`; they read
  `parts.deviceDB`.
* **For tests:** `safebyok/testing` has `TH.spyOnDeviceHook(deviceDB, verb)`. A DeviceDB's public
  verbs no longer reject, so a test that needs one to fail spies on its hook.
* **`isOutcomeShaped` is gone:** the restack deleted it (`9b780d04`, on #298). notes/security.md
  still named it; thread 4's sonnet subagent corrects that entry.
* **This machine is slow:** a full `eslint src tests` hit a five-minute timeout, and attw once took
  21 minutes. While building, lint and test single files, and run `pnpm justify` once at the end.

## The Coach's rulings, 2026-10-27

*Orchestrator:* the full record is the sprint doc's *Resolved* tab.
* **The stance behind them:** the people who extend this code are friends, clever, not
  adversaries or incompetent. Don't defend against a future programmer writing bad code by
  writing bad code in a critical path. Where in-module defenses exist, rely on them.
* **Thread 1:** `adapterAnswer`'s Outcome check stays removed. The defence is `describeVaultDB`.
  `Refusals.unexpectedError` stays beside the top-level export: the Coach is "perfectly happy for
  every refusal type to have a functional form".
* **Thread 3:** all of #298's open questions are settled as built.
  - The silent discard is accepted, and `raisedDeviceRecord` and `deviceOutcomeOf` stay off the
    exports.
  - The scopepath hooks stay, with no helper.
  - `putLease` gets no new checks: `deviceRecordOf` and `sealLeaseRecord` already build and
    check every record.
  - Still in the doc, as explained rows: `spyOnDeviceHook`, and the overridden-verb guard (my
    revised recommendation is no guard).
* **The documentarian's `stash@{0}` is ignored.** Thread 5 is new: a documentarian run on the
  core's `src/`, split into three runs.

## The restack, 2026-10-27

*Orchestrator:*
* **The line is main → #297 → #299 → #298.** Only #298 needed rebasing, onto #299, and it went
  cleanly; one commit on top deletes `isOutcomeShaped`. `pnpm justify` is green at the top
  (`9b780d04`: safebyok 3403 passed, 37 skipped). Pushed with a lease on the old tip.
* **Thread 4 is cut from `9b780d04`.** Its handoff carries the security.md corrections (the
  `deviceOutcomeOf` and `isOutcomeShaped` entries, and the length of thread 1's entry).
