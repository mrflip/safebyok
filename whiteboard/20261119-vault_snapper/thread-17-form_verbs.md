# Thread 17: form_verbs (2026-11-20)

Branch `20261120-form_verbs`, PR #785, stacked on #784 (`20261120-logical_gating`). Design:
`whiteboard/20261119-vault_snapper/gating-forms.md` (in the base checkout). Proved: `safebyok` lint, typecheck (with
forgotten-exports) and 1314 tests green; `safebyok-react` **red on purpose**, mended by thread 18 (below).

* **Built** (`packages/safebyok/src/`):
  * `models/bank.ts` *Form verbs*: `Bank.birth(device, cleartexts)` (a static, kept on Bank: it needs the private
    `#birthByProving`, and a Device verb would need a friend of its own), `unlock`, `replacePassphrase`, `addPasskey`,
    `revokePasskey`. Each plain verb throws; each `tryFoo` is `Outcome.outcomeOf(() => this.foo(…))`. Each hands the
    cleartexts unread to its attempt in `gating.ts` with `#gatingFriend()` (`unlockByProving`, `putGate`).
  * `models/bank.ts` *The awaited unlock*: `ensureUnlocked()` returns at once when unlocked, else opens (or joins) the
    one `#unlockWait` and awaits it. `unlockWanted` in `BankSnapshot` is `#unlockWait !== null`, so it goes false
    whenever the wait settles. `#attachLease` resolves it (so any unlock, gate change or birth does);
    `dismissUnlock()` rejects it `dismissed` (new core thrower `unlockDismissed`, phrase `UnlockDismissed`; big's kind
    `dismissed` reused); `sweep()` rejects it with `endCause`, synchronously, before its align. `lock()` leaves it.
    The wait is a module-level `makeWait()` (ES2023 lib: no `Promise.withResolvers`).
  * `models/gating.ts`: the `Gating` class, its loop, `isCorrectable` and `attemptWithoutGating` are gone. The five
    attempts each run their body in `try { … } finally { spendCleartexts(cleartexts) }`, first line
    `bank.demandEnabled()` (birth: `Checks.device.parse(device).demandEnabled()`). Helpers: `checkStrength` (throws
    `weak_passphrase` from `device.judgeStrength`), `provingOf(device, gate, proof)` (the stored proving the proof is
    for), `nextGateAsk(ante, wayins, policy)`, `spendCleartexts` (zeroes `passkeyClear` and `nextPasskeyClear`).
  * `shapes/shapes-gateish.ts`: `CleartextChecks` (`birth`, `unlock` are big's; `passphraseReplace`, `passkeyAdd`,
    `passkeyRevoke` new) and their input types; `ProvedCleartexts`. Removed `gatingkindVals`, `Gatingkind`,
    `GatingSnapshot`, `CleartextsForGatingkind`, `GatingAttempt`, `RequestCleartext`, `AskUser`, `GatingOpts`,
    `GatingRecord`. `Modelkind` loses `'gating'`.
  * `models/device.ts`: `judgeStrength(passphrase)`, the one public strength check. Removed `askUser`,
    `requestCleartext` (now refused as an unknown option), `guardRequestCleartext`, `openGating`, `attachGating`,
    `detachGating`, `alignOpenGating`, `#gatingseq`. `DeviceSnapshot` is `{ bank }`; `OpenGatingSnapshot` is gone.
  * Tests: `bank-prompts.test.ts` became `bank-forms.test.ts` (every verb's good path, each condition refusal, spending,
    the awaited unlock); `gating.test.ts` covers `Bank.birth` and spending; `device.test.ts`, `vault.test.ts`,
    `bank.test.ts` and `models-world.ts` (`answerPrompt` gone; `buildBornBank` births by `Bank.birth`) follow.
  * Notes: `notes/wontfix.md` (the open-gating entry replaced by one on a lock, sweep or second verb while a verb runs),
    `notes/guarantees-drift.md` (G2 tightened, G9 amended), `notes/security.md` (seven entries, by a sonnet subagent),
    `VOCABULARY.md` (*form verb*, *awaited unlock*), changeset `20261120-form_verbs.md` (empty: safebyok is private).
* **Decisions made**:
  * **Gate or ask** (the Coach's question): the attempt builds the **ask**, through `nextGateAsk(ante, wayins,
    policy)`. The ask must cite the gate the proof was made against, and only the attempt holds it: a bank building the
    ask from a next record would re-read its own `#maingate`, which may have moved while the attempt awaited its
    derivations, and so cite a gate the proof never met (all or nothing breaks quietly) or rederive the ante the attempt
    already had. `gate.withPassphrase(proved, …)` was set aside too: it hands a proving to `Gate`, against G9. The
    helper is three fields, one call per gate change, and reads at the call site; not over-DRY.
  * **Proof shape**: a gate change's proof is named as an unlock's, `passphraseClear` or `passkeyClear`; what it puts
    in place is `next…`: `{ passphraseClear | passkeyClear, nextPassphraseClear }`, `{ passphraseClear,
    nextPasskeyClear }`, `{ passphraseClear | passkeyClear }`. Big's `passkeyAddCleartexts` (`passkeyClear` = the new
    passkey) was not reused, since `passkeyClear` is a proof everywhere else. Birth keeps big's shape (nothing to
    prove). Given both proofs, the passphrase is tried, as big's unlock shape does.
  * **Strength name**: `judgeStrength`, not `checkStrength`: STYLE.md's `checkFoo` refuses and returns nothing, and the
    meter wants the verdict. The refusing helper in `gating.ts` is the private `checkStrength`.
  * **Order** in `replacePassphrase`: demandEnabled, shape, `same_passphrase` (only for a passphrase proof), strength,
    prove the ante, derive the next. `PassphraseProving.buildNovel` still judges strength, so the checker hears the new
    passphrase twice there; kept, so no wayin can ever be built from a weak passphrase.
  * **`revokePasskey` with no passkey** proves, unlocks, writes nothing (it used to return at once, unproved and
    perhaps locked). Throwing would be a predictive throw; writing would meet the policy's `NoPasskeyStored`.
  * Every attempt starts with `demandEnabled()` inside its `try`, so a swept bank derives nothing and still spends.
* **Deviations**: none from the design. The gate-change lease is built from the ante proving (as before), so a lease
  proved by a just-revoked passkey cites the new gate: recorded in security.md.
* **Discoveries**:
  * `device.keyDeriver` is frozen: spy on a host deriver handed to `makeDevice`, as `bankDerivingWatched` does.
  * A second `Bank.make` over the stored bank (`{ ...record, rootBox: bank.rootBox }`) is the way to provoke a real
    `stale_write` sequentially.
* **For thread 18** (safebyok-react, the giver): `react-giver.ts` reads `DeviceSnapshot.gating` and imports
  `OpenGatingSnapshot`; `fake-giver-world.ts` builds a `gating` and a `BankSnapshot` without `unlockWanted`;
  `react-giver.test.tsx` and `knock-knock.test.tsx` (4 tests red: it drives `tryAttemptUnlock` and reads the open
  gating). A giver's unlock form shows on `bank.unlockWanted`, submits `bank.unlock`, closes on `bank.dismissUnlock()`;
  a meter calls `device.judgeStrength`.
