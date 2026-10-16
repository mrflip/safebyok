# Thread 10: secure_floor (2026-10-16)

Branch `20261016-secure_floor`, PR [#136](https://github.com/mrflip/safebyok/pull/136), stacked on
[#132](https://github.com/mrflip/safebyok/pull/132) (thread 4, at `57cdb168`). Justify: green;
the core 1746 passed and 33 skipped, React 111, the demo 162 and 15 skipped, every other package as
on its base. `pnpm size`: green; openVault 25.22 kB of 28 kB.

* **Built**:
  - `openVault({ passphraseStrengthTest })` (`src/passphrase-strength.ts`, wired in `vault.ts`): runs
    on the passphrase the first `unlock()` creates a vault with (in `settleUnlock`, after the
    refresh shows the vault absent), and on `addPassphrase` and `changePassphrase`'s new one, at the
    door before any derivation. It never runs at `unlock` of a vault that stands. A weak verdict is
    refused as `weak_passphrase` (a **condition**), the verdict's reason the message. A test that
    is not a function, or answers no verdict, is refused as `bad_option`, and whatever it throws
    passes through.
  - The default is `passphraseLengthTest`: at least `MinPassphraseChars` (12) code points, counted as
    `mask` counts them (`/./gsu`), with no composition rules. Exported from `safebyok` with the types
    `PassphraseStrengthTest` and `PassphraseVerdict`.
  - `zxcvbnPassphraseTest` and `MinZxcvbnScore` (3), exported from `safebyok/browser` only
    (`src/zxcvbn-passphrase-test.ts`): the length floor, then a zxcvbn score of at least 3 over
    `@zxcvbn-ts/language-common`'s dictionary and keyboard graphs. The reasons are our own sentences,
    keyed by zxcvbn's warning keys, and give no composition advice. Its estimator is built at the
    first call (about 15 ms), never at import.
  - `insecure_context` (misuse): `openVault` refuses first of all where `isSecureContext === false`.
  - G032: `passphraseKeyOf` (`envelope.ts`) refuses 32 zero bytes as `bad_option`. It is the one
    door every deriver's output passes, so one check covers every deriver.
  - `VaultProvider` passes the new prop through (its `satisfies Record<keyof OpenVaultOpts,
    unknown>` demands it). *After review, the orchestrator's YOLO call:* it holds the latest test
    in a ref and hands `openVault` one stable wrapper, `(typed) => (ref.current ??
    passphraseLengthTest)(typed)`, so an arrow in the props never reopens the vault; it refuses a
    test that is not a function at render (`bad_option`, to the boundary), as openVault would.
    Tests: the prop reaches the vault, the default applies without it, rerenders with new arrows
    keep the handle and run the latest, a non-function reaches the boundary.
  - `safebyok/testing`: `anyPassphraseTest`, which `memoryVaultOpts` uses, so suites keep their
    `'pw'`s. `vault.test.ts`'s `makeWorld` and three React test setups pass it too.
  - Size: one line appended for `zxcvbnPassphraseTest`, 216.3 kB measured, a 220 kB budget.
    `browserOpts` is unchanged (14.23 kB), and a test proves that zxcvbn never ships with it.
* **How a field calls the test (for thread 14)**: the test is a plain, side-effect-free function of
  the passphrase, with no vault behind it. Take the same function the provider got
  (`passphraseStrengthTest ?? passphraseLengthTest`):

  ```ts
  const verdict = await passphraseStrengthTest(typed)   // both supplied tests answer at once; a host's may answer a promise
  setAdvice(verdict.strong ? '' : verdict.reason)       // calm, never quotes the passphrase
  ```

  Run it only when *setting* a passphrase (the first unlock of an `absent` vault, an add, a
  change), never while entering one to unlock. `weak_passphrase` is a condition, so
  `PassphraseModal` already shows its message (`isVaultCondition` -> `err.message`) with no React
  change.
* **Decisions taken**:
  - **`@zxcvbn-ts/language-common` came in beside `@zxcvbn-ts/core`.** On its own, core is a sham:
    `password1234` scores 4 of 4, and only repeats and sequences are caught. The dictionary is what
    makes zxcvbn zxcvbn, and the question the Coach said yes to named "`@zxcvbn-ts/core` and its
    dictionaries". Both are from the same monorepo, about 1.6M downloads a week, and months old.
  - **Not folded into `browserOpts`**: 216 kB against browserOpts' 14 kB.
  - **No English translations package**: zxcvbn's default feedback is its keys, and we map the 16
    warning keys to our own sentences (typed against `TranslationKeys`). Its suggestions are
    dropped, since several are composition rules NIST advises against.
  - **The all-zero check** is a one-line OR-fold (libsodium's `sodium_is_zero` shape), reading
    every byte. No present dependency offers one. *After review, the orchestrator's YOLO call:*
    its doc block and `notes/security.md` no longer claim constant time; they say it has no early
    exit, and that nothing secret rides on its timing, an all-zero output being refused.
  - **The lazy estimator** is held in a module-level object (`made.estimator ??= ...`), like
    `browser.ts`'s `bagsByDbName`. The linter refuses a top-level `let` assigned from a function.
* **Deviations**: touched `safebyok-react`'s source (the provider's pass-through), which the plan
  did not list; typecheck needs it. The React README also gained the `passphraseStrengthTest` prop.
* **Discoveries**: zxcvbn-ts v4 replaced v3's global `zxcvbnOptions.setOptions` with `new
  ZxcvbnFactory(options)`, so there is no global state to share with a host. `@zxcvbn-ts/core` has no
  `sideEffects` flag, yet Rolldown drops it from `browserOpts` alone (tested).
* **Rows** (for the orchestrator's sweep):
  - G032: **closed** (code, `envelope.ts`; `notes/security.md`).
  - Soonish line *refuse to work over http*: **closed** (code, `insecure_context`).
  - Soonish line *Passkey requiring passcode value*: **closed** (React README: `userVerification:
    'required'` at creation and every assertion, already so in `passkey.ts`).
  - Soonish line *Password strength*: **closed** (code; the preplan's *Opens*, a strength library,
    was answered by the Coach's ruling).
* **For the Coach**:
  - **NIST's number.** SP 800-63B rev. 4 asks 15 characters of a password that is the only
    factor, and a vault passphrase is one. The ruling said 12, so 12 it is; `MinPassphraseChars`
    is one constant to raise.
  - **A second runtime dependency**, `@zxcvbn-ts/language-common`: read as covered by your yes
    (above). Say so if not, and `zxcvbnPassphraseTest` would take the dictionary from the host
    instead.
  - **zxcvbn's threshold** is score 3 (zxcvbn's own advice). 4 would refuse more
    sentence-passphrases.
  - **Not passed to the test: the vault's names** (zxcvbn's `userInputs`, which penalize
    `acme-mrflip`). It would need a second argument. Left out for one plain signature.
  - **A race at create**: a weak passphrase is refused even when another device creates the vault
    in the same instant, where it would have been tried against theirs. The retry finds the vault
    and unlocks.
