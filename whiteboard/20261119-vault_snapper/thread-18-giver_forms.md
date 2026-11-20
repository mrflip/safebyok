# Thread 18: giver_forms (2026-11-20)

Branch `20261120-giver_forms`, PR #786, stacked on #785 (thread 17, form_verbs). Proved: safebyok-react's tests 346/346, lint and typecheck clean; `pnpm justify` green after the catch-up onto #785 at 6bafd4604 (safebyok 1317, safebyok-big 2946, safebyok-react 346, e2e 576, every package green).

* **Built** (all in `packages/safebyok-react/src/giver/`):
  * `useGating` and the giver's `ServerSnapshot` are gone. Nothing gating-shaped is left in the giver.
  * `GiverBank` gains the bank's form verbs (`birth`, `unlock`, `replacePassphrase`, `addPasskey`, `revokePasskey`) and `dismissUnlock`. `GiverDevice` gains `judgeStrength`.
  * In `minder-bank.ts`, `giverBankOfVault(vault)` builds that bank over the real core. Its box reads come from `giverBankOfMinder`, which now returns only the two box reads.
  * `forBank(...)` returns, for each verb, `xMutationOptions()` (TanStack v5 `mutationOptions`) and a thin hook `useX()` = `useMutation(xMutationOptions())`, plus `dismissUnlock()`.
  * Each mutation's `mutationFn` takes the cleartexts (`takeCleartexts`), awaits `device.ensureBank()`, and calls the verb. It resolves `void`.
  * The mutation key is `[...bankQueryKey, verb]`, and `networkMode` is `'always'`.
  * The add-passkey doc block and its @example put the WebAuthn ceremony first, in the click.
  * `Giver.useStrengthVerdict()` returns `{ verdict, isJudging, lastErr, judge(passphrase) }` over `device.judgeStrength`, for a live meter.
  * Tests:
    * knock-knock is rewritten. Its unlock form renders off `unlockWanted`, submits through `useUnlock`, and cancels with `dismissUnlock`. A new test shows that dismiss refuses the joke `dismissed`, and that the vault stays locked.
    * react-giver.test has a pair of tests per verb (its mutationOptions and its hook run the right verb with the cleartexts), and tests for the emptied handed object, a refusal as the mutation's error, the keys, dismissUnlock, and useStrengthVerdict.
    * The fake world records `formCalls` and adds `pauseVerdicts`, `refuseFormVerbs` and `refuseVerdicts`.
  * Adds a notes/security.md entry on taking the cleartexts.
* **Decisions made**:
  * **The giver takes the cleartext fields out of the object handed to `mutate`.** React Query keeps a mutation's variables by reference in its cache and devtools until the mutation is collected, and a passphrase string cannot be zeroed. `takeCleartexts` copies the fields, deletes them from the host's object, and hands the copy to the verb. Set aside: documenting "pass a fresh object" and trusting the host. The secret-search tests check React Query entries, so a host following the @example would fail them.
  * **The form verbs live on `GiverBank`, birth included.** The giver's bank object exists for an unborn scope (stage `unborn`). The core's `Bank.birth` is static, so `giverBankOfVault` calls `Bank.birth(bank.device, …)`.
  * **The mutations resolve `void`.** The snapshot says what changed. Handing the Bank to a host's `onSuccess` would leak a core object past the giver's interface.
  * **`networkMode: 'always'`.** Paused offline, a mutation would hold the cleartexts, and an unlock needs no network.
  * **`dismissUnlock` is a plain async function on the bank giver**, not a hook. A close button calls it.
  * **`useStrengthVerdict` lives on the device giver** (the checker is the Device's), and takes the passphrase through `judge`. The hook never holds the passphrase, so the input can stay uncontrolled. Only the latest call's verdict lands, tracked by a seq ref, because an async checker (zxcvbn loading its dictionary) can answer out of order. That is UX correctness for the meter, not core machinery. No test exercises the crossing.
  * **The thin hooks take no options**, unlike `useBoxRecord`. A host that wants `onSuccess` and the like spreads `xMutationOptions()` into its own `useMutation`.
* **Deviations**:
  * The knock-knock world still builds the bank and vault through the core's test helpers, and `_cheat_giverDeviceOf` now hands the giver `judgeStrength` too.
  * The minder giver world refuses the form verbs (`refuseNoGate`), since it has no gate.
* **Discoveries**: The vitest run needs `safebyok` built first (`pnpm --filter safebyok-react test` does that). A bare `npx vitest` in a fresh worktree fails to resolve `safebyok`.
* **For the Coach**:
  * Is it right for the giver to empty the host's object? That is a side effect on an argument. The alternative is a doc warning plus a failing secret-search for a host that keeps its own object.
  * Is the latest-wins seq in the meter acceptable under "no concurrency machinery"?
