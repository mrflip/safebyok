# Thread 22: local_roots (2026-11-24)

Branch `20261124-local_roots`, PR pending, stacked on [#887](https://github.com/mrflip/safebyok/pull/887). Proved: in progress.

Built by hand (no /sprint), two pieces, E first.

* **Built**:
  * **E**. The giver's four gate form verb makers call `demandBankOrVacate(params)`, beside `demandBank` in
    `react-giver.tsx`: where `demandBank()` refuses, `vacateHanded(params)` clears what the verb was handed, and the same
    refusal is thrown. `World.vacateUnlessAttemptable` and the friend's `deviceNow` (and `demandBank`, which the bank's
    hooks no longer read) are gone. `vacateHanded` is exported from the core. Added by the orchestrator mid-thread: the
    birth verb (`useBirth`'s maker, `gatingBirthAttempt`) calls `demandDeviceOrVacate(params)`, the same over
    `demandDevice`. `GatingChecks.anyGating` already reads the birth's names (`passphrase`, `passkeyAnswer`), and
    `confirmation` is among `FormSecretFieldnames`, so the check needed nothing.
  * **P**. In progress: the persisters go; the bank's three roots are kept in a host's Web Storage.
* **Decisions made**:
  * E: two plain functions, `demandBankOrVacate` and `demandDeviceOrVacate`, not one helper over a demand: each is four
    lines, and a debugger reads it at once.
  * E: the world's case that tested `vacateHanded`'s reading (every verb's names, sloppy input, never throws) moved to
    `gating.test.ts` as `vacateHanded(handed)`, since it is now a core export; the other two world cases are deleted.
