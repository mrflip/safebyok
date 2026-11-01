# Thread 3a: gating (2026-11-01)

Branch `20261101-gating`, PR (draft, number below once open), stacked on
[#426](https://github.com/mrflip/safebyok/pull/426). Justify: green; core 4828 passed, 37
skipped; every package green.

* **Built**
  * `src/models/gating.ts`: the `Gating` class and its ask loop. `Gating.launch(kind, opts)`
    makes one, hands it to the world's `requestCleartext`, and resolves once it settles, the
    dialog still open or not; the dialog closing settles a gating still open as declined
    ('vault_locked'). `attempt`/`tryAttempt` run the verb's private `#verbBy` form with the
    cleartexts; a correctable refusal (`correctableKindVals`: wrong passphrase or passkey, weak or
    unchanged passphrase) leaves the gating open, anything else settles it. `decline()`,
    `isOpen`, `provedBy` (from `ProvedByForGatingkind`), `checkStrength`/`tryCheckStrength`
    (moved from thread 2), and `toJSON` (kind and scope, never the vault). `GatingOpts` is a bag,
    so thread 10's `reason` rides in it.
  * Entry points on the vault and bank: `vault.ensureUnlocked()`, `replacePassphrase()`,
    `addPasskey()`, `revokePasskey()`, `bank.ensureVault()`, each taking cleartext values or,
    handed none, launching its kind. The `Gate` makes no gatings.
  * The closures are gone: `AttemptClosure`, `PassphraseClosure`, `PasskeyClosure`,
    `makeFromClosure`, `invokeProofClosure`, and the factories `proofClosureThrew`,
    `noProofToUnlock`, `noRequestCleartext`, `changeNeedsPassphrase`. `closureWithRecord` is
    `cleartextsWithRecord`.
  * `requestCleartext` is required in `BankOpts` and the world types (`models-shapes.ts`).
  * `src/helpers/deferred.ts`: `deferred()`, a few lines, for `Promise.withResolvers` (ES2024; the
    target is ES2022). No library in the tree offers it.
  * Tests: `tests/models/gating.test.ts` (new, 30), `tests/helpers/deferred.test.ts` (new); the
    models' tests take values (`byPassphrase`, `await byPasskey(tag)`), and the test world's
    `requestCleartext` answers at once (`answerAtOnce(UsualAnswers)`), `declineAtOnce` where a
    test wants the decline.
  * The YOLO rename: `RaisedGating` is `LaunchedGating`, and every "raises a gating" is
    "launches", in the old core, both READMEs, VOCABULARY.md, safebyok-react's source and test
    helpers (`heldGatingOf(vault, launch)`, `launching` locals), and the demo. The device
    record's "raise" (and leaseHours, limits, exceptions) is untouched.
* **Decisions taken**
  * `attempt` throws and `tryAttempt` answers an Outcome (ground rule 1); the dialog calls
    `tryAttempt`.
  * Attempts run one at a time on a promise chain; `decline()` and the dialog's closing wait for
    an attempt in flight, so an attempt that succeeds wins over a decline made during it.
  * `launch` answers on settling, not on the dialog's closing: the thread says the verb "awaits
    settlement", and a host dialog that lingers on a success message should not hold the verb.
  * The strength check sits in the `Gate` (`build`, `withPassphraseReplaced`), so a direct
    `replacePassphrase(cleartexts)` is checked as a gated one is; `same_passphrase` is checked
    before the strength check.
  * `gating.checkStrength(passphrase)` takes a plain string and checks it (it is the host's
    entry point), where `proving.checkStrength` takes the branded cleartext.
  * Every export that takes cleartexts spends a passkey answer in `finally`: I added it to
    `replacePassphrase` and `revokePasskey`, which take no passkey but may be handed one (G2).
  * A 'bad_option' from an attempt (a passkey proof where only the passphrase proves) settles
    the gating: it is not correctable. 3b may want it otherwise.
  * The literal 'Expected a vault, or null' stays in `gating.ts`'s local `Checks`: it names the
    class, which `models-shapes.ts` cannot import without a cycle.
* **Deviations**
  * `tests/loosened/loosened.test.ts`'s pinned "README:853, no strength check on replace" test
    is removed: this thread makes the replace checked, so the looseness it pinned is gone.
  * `bank.#ensureVault` still wraps the build in `outcomeOf` and rethrows all but
    'stale_write' (it was there before; 4a replaces it with the listing's put-first `ensure`).
* **Discoveries**
  * Narrowing an `AnyGating` in a test needs `if (gating.gatingkind !== 'X') throw`; without it
    `tryAttempt` on the union takes the intersection of the kinds' cleartexts.
  * The GAPs in `models/gating.ts` are closed; `bank.ts`'s four stay (pester, box listing, 4a's
    put-first ensure, 4b's eviction).
* **For the Coach**
  * **Suppressions**: none added.
  * **bad_option settles a gating**: recommend keeping it; 3b declares the refusal-kind list.
  * **deferred() hand-written**: a few lines, no library in the tree; say if one should own it.
