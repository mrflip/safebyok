# Fixup sprint done, 2026-10-27

The sprint built `fixup-preplan.md` items 1 to 5 and 8, the `unstanding.md` brief, and a
documentarian pass over the core's `src/`. It ran as seven PRs in one line, with the sprint PR on
top: merging #295 merges them all. Every review came back clean or fixed, with nothing
significant left open. The only `flagged` review was thread 1's, and the Coach ruled on it.

* **Sprint doc:** https://claude.ai/artifact/Qvwd1KJxaAJKZtMtgaMNBg. Open Matters holds the
  questions still open.
* **Plan:** `whiteboard/20261027-fixup_sprint/fixup_sprint-plan.md`. It has a *Review:* line per
  thread.
* **Rulings:** `whiteboard/20261027-fixup_sprint/fixup_sprint-resolutions.md`.

## The line, in merge order

| PR | Thread | What it does |
|---|---|---|
| [#297](https://github.com/mrflip/safebyok/pull/297) | 1. `outcome_default` | `outcomeOf`'s default is `unexpectedError`. `adapterAnswer` is the try/catch alone. `unexpectedError` moves to refusals.ts. Bottom of the line, on `main`. |
| [#299](https://github.com/mrflip/safebyok/pull/299) | 2. `vault_params` | Drops the redundant `vaultTok` parameters, inlines `#boxUnder`, adds `#leaseInForce`, `#holdLease` and `src/text.ts`. Stacked on #297. |
| [#298](https://github.com/mrflip/safebyok/pull/298) | 3. `device_db_class` | DeviceDB becomes an abstract base class, with `describeDeviceDB`. This closes the idb device-record race. `isOutcomeShaped` is deleted at the restack. Stacked on #299. |
| [#300](https://github.com/mrflip/safebyok/pull/300) | 4. `retire_standing` | "Standing" is retired: rows are *stored*, the record in hand is *held*, a gating is *pending*, a lease is *in force*. `#freshGatedRecord` becomes `#freshenGated`. Stacked on #298. |
| [#303](https://github.com/mrflip/safebyok/pull/303) | 5c. `docblocks_core_rest` | Doc blocks of the 44 core files not in 5a or 5b. Stacked on #300. |
| [#304](https://github.com/mrflip/safebyok/pull/304) | 5a. `docblocks_core_vault` | vault.ts's doc blocks, including the class-wide lock rule. Stacked on #303. |
| [#302](https://github.com/mrflip/safebyok/pull/302) | 5b. `docblocks_core_storage` | Doc blocks of the storage and refusal files. Stacked on #304. |
| [#295](https://github.com/mrflip/safebyok/pull/295) | sprint PR | This note, the plan, the progress notes and the resolutions. Top of the line. |

Each PR's first line says what it is stacked on.

## Still open

The sprint doc's Open Matters has the full rows. Each is a question for you, with a Rec:
* **TOP:** VAULTDB.md tells adapter authors a stale delete answers `false`, but the code takes
  `null`. Its §5.1 is right; lines 28 and 46 are not.
* **TOP:** the class-wide lock rule in vault.ts's class doc (#304) is a new promise. Rec: keep it,
  and pin it with a test.
* **TOP:** confirm #303's wording of what holds a vaultKey between calls.
* The empty changeset for #300's reworded refusal messages.
* `fitsLease(vaultRecord)` and Convex's `written` (#300). Rec: keep both.
* A full localStorage: `storage_blocked` or `storage_unavailable`?
* Correct the README's `whisper_too_large` row: the code weighs the whisper and its sidecar together.
* `delBox` taking `undefined` as stale, as `delVault` does.
* Whether `Box.make` should check its vault, and the `Box.seal(vault, undefined)` gap.
* `gate_made_elsewhere` reaching callers.
* Two exceptions to the verb table: `getWhisper`'s `absent_box`, and `consistentWith`'s `bad_option`.
* `onBadNews` throwing during a vault's birth.
* The proposed renames, one row each.

## Follow-ups owed after the sprint

These are on the doc's Cleanup tab, under *Finally*:
* Preplan items 6 (`type` over `interface`) and 7 (`function` declarations, after this merges),
  each as its own PR.
* One rename PR, for whatever renames you take.
* One PR for stale refusal messages:
  - "proof" in `Lease.make` and box.ts's `lockedError`;
  - `useWhisper`'s "use needs a callback";
  - `#gateWriteRefusal`'s `stale_write` text.
* Reword `lock()`'s "Forget the unlock" in the next pass over vault.ts.
* A process PR: have `style-reviewer` commit with PROCESS.md's prefixes, not `style:`.
* Move `OutsideGating` into the test helpers.
* Have a `sonnet` subagent check that thread 3's first security.md amendment keeps the file's
  header rules.
* Remove the empty, locked reviewer worktree `.claude/worktrees/agent-a90f998889ecffd1a` once
  its lock lifts.

## Caveats

* No `@ts-expect-error` or `eslint-disable` was added anywhere in the line.
* This machine is slow. Worker streams stalled three times in thread 3, and one timing test
  (`tests/test-helpers.test.ts`, "misses that late device…") once timed out at 5 s. It passed
  alone and on the next full run.
* The restacks used leased force-pushes only: #298 onto #299, #304 onto #303, #302 onto #304, and
  5c's squash of two `plan:` commits.
