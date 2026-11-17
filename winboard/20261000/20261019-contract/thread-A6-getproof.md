# Thread A6: getproof (2026-10-19)

Branch `20261019-getproof`, [PR #200](https://github.com/mrflip/safebyok/pull/200), stacked on
[#199](https://github.com/mrflip/safebyok/pull/199) (`20261019-react_over_class`). Justify: green;
core 2375 (35 skipped), react 263, demo 215 (16 skipped), 0 failed.

* **Built**:
  * `packages/safebyok/src/ask.ts` (new): `class Ask` -- `why`, `vault`, `attempt`, `lockLanded`
    -- with `Ask.raise(why, vault, attempter, getProof)` handing the vault a `RaisedAsk`: the ask,
    its one shared `answer` (an `Outcome<ProofAnswer>`), and `landLock`. The answer is checked
    here, once (anything but the three, or `carry_on` outside `lease_ending`, is `bad_option`,
    quoting nothing; a throw is `unexpected_error`). One `AbortController` per ask: aborting it
    settles `lockLanded`, refuses the answer `vault_locked`, and stands down attempts.
    `AskWhyVals`, `ProofAnswerVals`, types `AskWhy`, `ProofAnswer`, `GetProof`.
  * `vault.ts`, section `[Asking for a proof]`: `#ensureLease(renewWithinMillis)` -- hello (stale-
    aware), `#whyAsk`, the prompt up or `#raiseAsk(why)`, the answer, hello again on `unlocked`,
    `#checkUnlocked()` -- eleven lines of sequencing, no crypto. `#landLock()` in `tryLock`,
    `tryClose` and `tryDel` (at its shut). `#tryAttempt` and `#unlockWith(proof, opts, overtaken?)`,
    today's unlock body, shared with `tryUnlock`. Public pair `tryEnsureLease(opts?)` /
    `ensureLease(opts?)` (`renewWithin` in minutes; an event is no options, as for `hello`).
    `#grantLease(..., overtaken?)`: an overtaken attempt writes no lease, or erases the one it just
    wrote. Data calls (`putBox`, `#openBox` for `getBox`/`getWhisper`/`useBox`, `delBox`) call
    `#ensureLease(0)`; `putBox` checks label, sidecar and whisper first.
  * `vault-opts.ts`: option `getProof` (`parseGetProof`), `parseRenewWithin`.
  * `safebyok-react`: `VaultProvider` is the vault's `getProof` -- its own dialog unless given one
    (prop `getProof`, held by ref as `onBadNews` is, gated per vault; `null` for none). The dialog
    shows only while `navigator.userActivation.isActive` is not false. `PassphraseModal` and
    `PasskeyUnlockButton` take `ask` and answer `onDone(ProofAnswer)`, once (`useAnswerOnce`),
    closing on `lockLanded` and answering `unlocked` when the vault unlocks under them.
    `attempt-refusals.ts` groups `attempt`'s refusals as the Contract does. Gone:
    `useWithUnlockedVault`, `WithUnlockedVault`, `awaitUnlock`, `endAsking`, `Asking`.
  * Tests: core `tests/vault/vault-lease.test.ts` section `[Asking for a proof]`, describes
    `vault.ensureLease, by the Contract`, `Vault.make's getProof`, `every data call, through
    ensureLease`, `getProof's attempt, by the Contract`. React: `vault-provider.test.tsx` split into
    `tests/vault-provider/` (`world.tsx`; `-dialog`, `-hooks`, `-options`, `-refusals`; moved
    describe titles unchanged), with `its getProof, the passphrase dialog` new; `tests/attempt-refusals.test.ts`;
    modal tests for lockLanded and the host-getProof example.
  * Docs: both READMEs (*Asking for a proof*; react's *Asking for the passphrase*), demo
    components, VOCABULARY's **ask** row, CLAUDE.md's *Reading* list, `notes/security.md` (three
    entries: getProof, Ask, lockLanded; sonnet subagent).
* **Decisions taken**:
  * **`ensureLease` came out as sequencing only.** `Ask` owns why, vault, attempt, lockLanded, the
    waiters (a shared promise) and the one answer; the vault keeps `#asking` and three hooks.
  * **Data calls hello through `staleMinutes`** (the Contract's step 1), not A3's once-settled
    `#hello()`: a data call reads storage again at most once a minute. No test needed changing.
  * **A lock under an attempt wins** (the Contract's "`vault_locked` (a lock won under the
    attempt)"): A3's AbortController pattern, no counter. Lands only for `lock()`, `close()`,
    `del()`; other relocks and `unlock()` outside a prompt are untouched (TODO lock timing,
    scenario 1, stays for the policy session). An attempt still under way when the user cancels
    is not stood down: it may unlock the vault later.
  * **Misuse from `attempt` goes to the dialog's boundary**, reported, then Close answers
    `declined` (drift 4).
  * **The shipped dialog is the default getProof now** (pulled forward from D2): with
    `withUnlockedVault` gone, a provider without it would never prompt. D2 keeps TanStack and
    `useBox`.
  * **`unlock()` kept** (drift 6); `PassphraseModal` no longer calls it.
* **Deviations**: none from the thread text. `PasskeyProof` keeps its name (drift 5, B1).
* **Discoveries**:
  * **Calls in flight when the provider closes its vault now reject** (`vault_locked` if waiting
    on the dialog, else `vault_closed`, misuse) where `withUnlockedVault` resolved null. A host's
    error boundary may see `vault_closed` on sign-out. C5 (close) should decide.
  * **Start over closes the dialog**: `del()` lands as a lock (drift 7).
  * **Storage out of reach now closes the dialog** (the Contract's grouping), where it was shown
    in place.
  * `putBox` validating before it prompts changed two demo tests: a bad label or a big key is
    refused with no dialog.
* **For the Coach** (Open Matters):
  * **Contract drift**, eight items with proposed text in
    [thread-A6-getproof-drift.md](thread-A6-getproof-drift.md). Recommend: carry each.
  * **`unlock()` stays public**, the only unlock for an app with no `getProof`. Recommend: keep,
    add to the Contract.
  * **`vault_closed` to calls in flight at the provider's close**. Recommend: C5 makes a close
    refuse calls in flight `vault_locked` (a condition), not misuse.
  * **Start over closes the dialog.** Recommend: keep (it is what a lock means); the alternative
    exempts a `del()` from inside the ask.
  * **The shipped dialog asks only on a user gesture.** Safari before 16.4 lacks
    `userActivation`, and is treated as always active. Recommend: keep.
* **Test counts** (vitest JSON; total includes skipped), base `549f28c5` to tip: core 2332 (35) to
  2375 (35), `tests/vault/vault-lease.test.ts` 84 to 127. React 244 to 263:
  `vault-provider.test.tsx` 93 split into `vault-provider/` 92 (dialog 26, hooks 12, options 22,
  refusals 32; eighteen `withUnlockedVault settles` tests gone, seventeen getProof tests in their
  place), `passphrase-modal.test.tsx` 91 to 98, `attempt-refusals.test.ts` 0 to 13. Demo 215 (16)
  unchanged, two retitled. Every other workspace unchanged.
* **Size**: `pnpm size:budget --write`: `Vault` 33 to 34 kB, `VaultProvider` 7.4 to 8.3,
  `reactEverything` 8.5 to 8.7.
* **Looked up**: the plan for D2 (the shipped `getProof` as the default) and the progress doc's
  *Interim shims standing*; the design doc's *React Usage* tab (via `doc-tab-reader`), for the
  provider's prompt store.
