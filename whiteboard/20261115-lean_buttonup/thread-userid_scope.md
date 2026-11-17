# Thread userid_scope: the new core names the user `userid` (2026-11-17)

Branch `20261117-userid_scope`, PR #717, stacked on #715 (`20261117-core_box`). Proved: `pnpm --filter safebyok lint
typecheck test`, 872 tests passing (871 before; one case added). `pnpm justify` not yet run: the thread is **blocked** on
directive 4, below.

* **Built**:
  - `Device` (`src/models/device.ts`): `Device.make` takes `{ userid, banklabel, device_tok }`; `device.userid`;
    `device.scope` is the new core's `BankScope` (`src/models/stamps.ts`); `toJSON` carries `userid`. `DeviceRecord` is
    `Z.infer` of a new `Checks.deviceRecord` (`obj({ userid: user_id, banklabel, device_tok })`), no longer a `Pick` of
    big's `SX.DeviceRow`.
  - `Gating` (`src/models/gating.ts`): exposes `userid`; `scope` is the new core's `BankScope`; `GatingSnapshot` is the
    new core's own type (`BankScope & { gatingkind, gatingTok }`), no longer big's with `gatingkind` swapped.
  - `Bank` (`src/models/bank.ts`): the constructor compares `bankScope.parse(parsed)` with `checked.device.scope`, the
    comment and the literal copy gone; `Bank.mintStamps` takes a `BankScope`. `CX` is no longer imported there.
  - `Proving.judgeStrength` (`src/models/proving.ts`) takes the new core's `BankScope`, through a new
    `Checks.strengthArgs` (big's `GX.strengthArgs` with `scope: Stamps.bankScope`). `buildNovel` passes its bank stamp
    straight in. **It is now the one place the user is copied to `user_id`**: for the host's strength checker, which
    still hears big's spelling (directive 4, held).
  - Tests: `WorldScope` is `{ userid, banklabel }` typed `BankScope`; bank, gating, device and proving tests follow.
    "another user's device" now asserts the refusal's `meta.fieldnames` is `['userid']` (and `['banklabel']` for the
    other-bank case), so it fails for the user, not just for some field. Device gained a case: a record naming the user
    `user_id` instead refuses.
  - Changeset `.changeset/20261117-userid_scope.md`: empty (the new core is private), with what a host sees.
* **Decisions made**:
  - The device record stays a stripping `obj`, as before, not strict: a record with both spellings passes, `user_id`
    dropped. Not in the directives to change.
  - Rather than copying `userid` to `user_id` in both `Gating.judgeStrength` and `buildNovel`, the copy moved into
    `Proving.judgeStrength`, the one call into big's strength machinery, so that both callers speak `BankScope`.
* **Discoveries** (the blocker): directive 4 said to report before changing anything if a default checker from big reads
  `user_id`. Big's whole strength seam does:
  - `Strength.StrengthChecker` and `GuardedStrengthChecker` (`safebyok-big/src/helpers/passphrase-strength.ts`) type the
    scope as big's `CX.BankScope`, `{ user_id, banklabel }`; the new core re-exports `StrengthChecker` from `safebyok`.
  - `guardStrengthChecker` parses the scope with `CX.bankScope` (requires `user_id`) before the host's checker hears it,
    so a guarded checker cannot be handed `{ userid }`.
  - `GX.provingDevice` types the device's `strengthChecker` as big's guarded one; Proving's checks are built on it.
  - `zxcvbnStrengthChecker` (`safebyok-big/browser`, `helpers/zxcvbn-strength-checker.ts`) parses its scope with big's
    `bankScope` and feeds `[user_id, banklabel]` to zxcvbn. Handed `{ userid, banklabel }` it throws `bad_option`, which
    the guard turns into a refusal: a new-core host using it would have every new passphrase refused.
  - `DefaultStrengthChecker` ignores the scope.
* **For the Coach**: how the strength checker comes to hear `userid` (the orchestrator's question; options in the PR body):
  - **A**: port `passphrase-strength.ts` into the new core (its own `StrengthChecker`, guard, default, over the new
    core's `BankScope`), and broaden big's `zxcvbnStrengthChecker` to read `userid` when `user_id` is absent.
  - **B**: as A, but port `zxcvbn-strength-checker.ts` too, which brings `@zxcvbn-ts/*` into the new core and wants a
    browser entry it does not have.
  - **C**: leave the strength seam in big's spelling until the strength checker is ported for its own sake: the host's
    checker hears `{ user_id, banklabel }`, copied in `Proving.judgeStrength` alone. This is what the branch does now.
