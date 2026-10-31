# Thread 5: tests_models (2026-10-31)

Branch `20261031-tests_models`, PR pending, stacked on #408 (`20261031-newvault_models`, rebased
onto its 4ff14b4b, recorded as `branch.20261031-tests_models.sprintbase`). Justify: green.

* **Built**: tests from outside for the models' cryptography, in `packages/safebyok/tests/models/`:
  `lease.test.ts` (grant, get/tryGet, forget, isInForce, the autolock under fake timers, the
  stamp-bound sealWith/unsealWith, tampered records, what a lease shows), `proving.test.ts`
  (makeProvingPair's arguments and closure, the keyDeriver's answers, headers, makeWayin,
  makeLease), `wayin.test.ts` (record check, pickle, toJSON), `gate.test.ts` (build, props by
  kind, pickle, toJSON).
* **Shared fakes, for thread 6**: `packages/safebyok/tests/test-helpers/proving-world.ts`, imported
  directly (not through `TH`): `useFakeClock`, `WorldStamp`, `duckVaultOf`/`asVault`,
  `fakeDBFriendOf` (a slot `kept`, a spy per verb, `logged`), `WeekMillis`, `grantedLeaseOf`,
  `sealStampsOf`, `TestPassphrase`, `DeviceId`, `provingWorldOf`, `passkeyAnswerOf`,
  `proofClosureOf`, `isZeroed`, and the backdoor `_cheat_vaultKeyBytesOf`.
* **Pending**: loosened pins in `tests/loosened/`.

## Deviations

* The handoff placed `models-world.ts` in `tests/models/`; it is in `tests/test-helpers/`, and
  the new fakes sit beside it.
