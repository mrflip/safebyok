# Thread userid_scope: the new core names the user `userid` (2026-11-17)

Branch `20261117-userid_scope`, PR #717, stacked on #715 (`20261117-core_box`). Proved: `pnpm --filter safebyok lint
typecheck test`, 904 tests passing (871 before the thread); `pnpm --filter safebyok-big lint typecheck test`, 3026
passing (one added); `pnpm justify` at the tip after the catch-up rebase.

* **Built**:
  - `Device` (`src/models/device.ts`): `Device.make` takes `{ userid, banklabel, device_tok }`; `device.userid`;
    `device.scope` is the new core's `BankScope` (`src/models/stamps.ts`); `toJSON` carries `userid`. `DeviceRecord` is
    `Z.infer` of a new `Checks.deviceRecord`, `obj({ userid: user_id, banklabel, device_tok }).strict()`, no longer a
    `Pick` of big's `SX.DeviceRow`. **Strict**: any other key refuses `bad_option`, so a leftover `user_id` beside
    `userid` is caught (the Coach's "strict for a whole type"). No caller in `src/` or `tests/` passed extra keys.
  - `Gating` (`src/models/gating.ts`): exposes `userid`; `scope` is the new core's `BankScope`; `GatingSnapshot` is the
    new core's own type (`BankScope & { gatingkind, gatingTok }`).
  - `Bank` (`src/models/bank.ts`): the constructor compares `bankScope.parse(parsed)` with `checked.device.scope`;
    `Bank.mintStamps` takes a `BankScope`.
  - **The strength checker, ported** (option A, the Coach's ruling): `src/helpers/passphrase-strength.ts` is big's
    `helpers/passphrase-strength.ts` over the new core's `BankScope`: `StrengthChecker`, `GuardedStrengthChecker`,
    `guardStrengthChecker`, `DefaultStrengthChecker`, and the `strengthChecker` check (built on big's
    `GX.isStrengthChecker`, newly exported). Its test is ported to `tests/helpers/passphrase-strength.test.ts`, plus a
    case that `guardStrengthChecker(zxcvbnStrengthChecker)` hears `userid`. `safebyok` exports the four; the re-export of
    big's `StrengthChecker` is gone.
  - `Proving` (`src/models/proving.ts`): its own `ProvingDevice` (big's `GX.provingDevice` extended with the new core's
    guarded strength checker), exported from `safebyok/core`, in every builder's checks and signatures.
    `judgeStrength` passes the parsed `{ userid, banklabel }` straight to the checker; the copy to `user_id` is gone.
  - Tests: `WorldScope` is `{ userid, banklabel }`; `provingDeviceOf` returns the new `ProvingDevice`. "another user's
    device" asserts `meta.fieldnames` is `['userid']`. Device record cases: `user_id` instead of `userid`, `user_id`
    beside it, and a key a record does not have, each `bad_option`.
  - Changeset `.changeset/20261117-userid_scope.md`: empty (the new core is private), with what a host sees.
* **safebyok-big, broadened only** (`notes/transition.md`):
  - `zxcvbnStrengthChecker` parses its scope as `union([bankScope, obj({ userid, banklabel })])`, reads `user_id`, or
    `userid` when `user_id` is absent, and gives zxcvbn the user either way. Its type takes either scope, so it fits
    both cores' `StrengthChecker`. One test added for the `userid` spelling; the rest unchanged.
  - `isStrengthChecker` (`shapes/shapes-gateish.ts`) is exported, for the new core's `strengthChecker` check.
  - The test helper `anyStrengthChecker` (`tests/test-helpers/builders.ts`) is typed `() => PassphraseVerdict`, reading
    no scope, so it fits either core's `StrengthChecker`.
* **Decisions made**:
  - The port keeps big's `StrongVerdict` rather than redefining it (`Strength.StrongVerdict`), so a verdict from big's
    zxcvbn checker and from the guard is the one frozen object. Big's `StrongVerdict` test stays in big.
  - Big's bank scope is `.readonly()`, which freezes; the new core's `bankScope` is not, so the guard freezes what the
    checker is told with `Object.freeze`, keeping the "frozen" test.
  - The port's doc block drops what describes big alone: `build_bank`, `replace_passphrase`, `unlock_bank`, and
    "each device's `ensureBank()` runs `load`".
  - The port cites G1, G8 and G9 (`notes/guarantees-big.md`), which it keeps in substance; no drift.
* **Set aside**: B, porting `zxcvbn-strength-checker.ts`, which brings `@zxcvbn-ts/*` and a browser entry into the new
  core; C, keeping the copy to `user_id` in `Proving.judgeStrength`. Typing the new core's test helpers with a local
  `anyStrengthChecker` was set aside for the broadening, as a second name for the same helper would shadow big's
  through `TH`'s `export *`.
* **Discoveries**:
  - **Nothing in the new core runs a strength checker's `load`.** Big's `ensureBank()` did; the new core's device keeps
    the guarded checker's `load` but calls it nowhere. zxcvbn's checker loads its dictionary lazily on first judgement,
    so it still works, at the cost of the first judgement's latency. A later thread may want a device to run it.
  - `notes/configuration.md`, which the default checker's reason points at, still describes big's API.
