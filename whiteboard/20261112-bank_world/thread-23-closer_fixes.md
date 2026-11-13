# Thread 23: closer fixes (2026-11-13)

Branch `20261113-closer_fixes`, stacked on #692 (thread 21, `20261113-gate_verbs_plain`). Justify: see the PR's **Tests:** line.

Plain fixes from two cold Closer Looks, approved by the Coach 2026-11-13 ("a skip; f only if the other refusal is not true or if it removes code; all the rest are good"). One commit per item, (a) to (l). No behaviour change except (k).

* **Built**
  * (a) `tests/models/bank-ending.test.ts`: the live bankDB watches are counted across a disabled lock, a vault tombstone, a sweep, and now a bank of another life (`spyWatches`).
  * (b) `Bank.lock()`'s doc block no longer says "its vaults".
  * (c) `notes/deliver-contract.md` L7 reads "listeners hear only when the list changes".
  * (d) `Storable.align` loops over its children itself (`alignChildren` gone); `Device.#remakeSnapshot` compares with `isEqual` from es-toolkit.
  * (e) device.ts's comment above `#bringUp` says what two `ensureBank` calls under way get.
  * (g) `demandPromptable` and `demandAttachable` were the same guard: `Bank.demandEnabled()` (in `gate.ts`, `gating.ts` and `bank.ts`). `stopNoWatch` and `noUnwatching` are `noop` from es-toolkit.
  * (h) the autolock test is titled for what it does.
  * (i) stale `world` names say what VOCABULARY says: `maxWorldMillis` is `maxParentMillis`, `ensureWorldTimely` is `ensureParentTimely`, the `world` of a proving is `device` (`ProvingDevice`, `provingDevice`, `provingDeviceOf` in the tests), and `rowOfOtherLife`, `demandOfLife`.
  * (j) `isListed` is `isKept`; VOCABULARY has rows for **enlist**, **listed**, **kept** and **take down** in thread 20's model.
  * (k) `VX.Promptly` is 3_600_000 (one hour), its doc block and tests follow.
  * (l) thread 20's style leftovers: `Vault`'s doc blocks (no `;` joining two facts, no named refusal kinds), and bank-ending.test.ts (`spyWatches` doc, shorter titles, the three `Endings` blurbs share one stem).
  * Changeset `.changeset/20261113-closer_fixes.md`: patch for `safebyok`, three entries (`maxParentMillis`, `isKept`, the hour).
* **Decisions taken**
  * (f) left alone. Of the wrong-named refusals the Closer Looks listed, none gives an untrue refusal and none is removed by a fix, so by the Coach's rule they are in the report, not changed.
  * (i) `helloed` keeps its `vault: null`: hooks.test.tsx reads it, and it tells `ensureBank`'s hello from a vault's.
  * (g) `demandEnabled()` is safe where `demandPromptable` and `demandAttachable` were: `Bank.isEnabled` is `super.isEnabled && isPresent`, so the `demandPresent()` that followed was dead.
  * The exported renames (`maxParentMillis`, `isKept`) are `patch`, as the sprint says, though STYLE and PROCESS say minor before 1.0.
* **Deviations**: none from the plan. `notes/gallant.md`, `design-models.md` and `design-proof.md` still name `demandPromptable` and `demandAttachable`: they are historic or design text, not edited. `notes/wontfix.md` L151 quotes the Coach's `maxWorldMillis` as he wrote it.
* **Discoveries**
  * (k) made `proof.test.ts`'s `StaleMillis` too short: it is now `Promptly + 1`.
  * (d) `isEqual` deep-compares `openGating` in the snapshot: harmless.
  * (j) code still says "listed" loosely in places (a box "listed" for any present box); VOCABULARY's row is the rule.
  * `safebyok-graphql`'s `bank-resolvers.ts` has its own `noUnwatching`; a separate package, untouched.
* **Guarantees**: checked *The guarantees* against the changes to bank.ts and device.ts (a guard merged, a snapshot compare, a doc block, comments). No line is falsified. G4's autolock text is unchanged.
* **For the Coach**: the PR stays a draft by instruction. No safety hatches added.
