# Thread 14: device_id is a label (2026-11-06)

Branch `20261106-deviceid_label`, PR #TBD, on main. Justify: green; safebyok 1855 tests in 61 files.

* **Built**: `device_id` in `packages/safebyok/src/shapes/shapes-core.ts` is now the kit's `label` instead of `str.min(1)`. That one checker serves `bankOpts`, `provingWorld`, both wayins and `deviceRecord`. `Bank` mints its default as `d${randomId().replaceAll('-', '')}` (33 lowercase hex-and-letter characters), at bank.ts's default site. Tests that fed hyphenated ids (`device-1` and kin) now use underscores. `bank.test.ts` gains a refusal case for a bad `device_id` at `Bank.make` (hyphens, capitals, empty, too long) and a test that the minted id matches `LabelPattern`. Changeset `minor`, `.changeset/20261106-deviceid_label.md`, carries the rule, the damaged-or-absent reading of old records and the "strict default, loosened when a host complains" sentence.
* **Decisions taken**: the minted form was the orchestrator's call, after I found that `randomId()` (a UUID) fails the label rule (hyphens, and a digit first about 10 times in 16); recorded for the Coach. Set aside: a new mint helper, a separate looser rule for `device_id`, and a length-only cap.
* **Deviations**: none. No suppressions.
* **Discoveries**: the `Kit` in `helpers/validator.ts` already carries `label`, so the change is one line of shape plus the mint.
* **For the Coach**: the minted form (`d` + 32 hex) is the orchestrator's choice, not the Coach's. Thread 8 (checkers once) can find the whole change at shapes-core.ts `device_id`.
