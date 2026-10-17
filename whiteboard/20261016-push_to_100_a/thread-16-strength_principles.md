# Thread 16: strength_principles (2026-10-17)

Branch `20261017-strength_principles`, PR [#142](https://github.com/mrflip/safebyok/pull/142),
stacked on #139. Justify: green (safebyok 2022 passed / 35 skipped; react 190; demo 184 / 16
skipped; every other package green; sizes within every line).

* **Built**:
  - **No strength test in the core.** `passphraseStrengthTest` is a required `openVault` option;
    without one, `bad_option` ("passphraseStrengthTest is required ... spread browserOpts()").
    `passphraseLengthTest` is gone from `safebyok`; `MinPassphraseChars` (12) moves to
    `safebyok/browser` beside `MinZxcvbnScore`, as the zxcvbn test's floor. `checkStrengthTest`
    is exported beside `checkValidators` (`src/passphrase-strength.ts`).
  - **`browserOpts()` brings `zxcvbnPassphraseTest`** (`src/browser.ts`), which now loads
    `@zxcvbn-ts/core` and `-language-common` by dynamic `import()` at its first call
    (`src/zxcvbn-passphrase-test.ts`) and answers through a promise. The length floor runs first,
    with no load. A failed load rejects (the vault refuses the passphrase: fails closed) and is
    forgotten, so the next call retries.
  - **The test hears the scope**: `PassphraseStrengthTest = (passphrase, scope: VaultScope)`; the
    vault passes its checked scope at create, add and change. zxcvbn gets each name whole and
    split on non-letters/digits (`q7.ladyfern@zinnia.example` gives `ladyfern`, `zinnia`, ...) as
    user inputs.
  - **`VaultProvider`**: thread 10's `strengthTestRef` and wrapper are gone. `checkStrengthTest`
    runs at render; the test goes to `openVault` as given, sits in the open effect's deps (a new
    identity reopens), and joins `logger`/`clock` in the once-only "changed identity" warning.
    With no `passphraseAdvice`, the dialog's advice is `adviceFrom(passphraseStrengthTest, scope)`
    (the reason, or null), scope from the asking vault's snapshot.
  - **The `vault_closed` flake (YOLO 23)**, settled in `withUnlockedVault`: see Discoveries.
  - Size: `.size-limit.json`'s `browserOpts` line gains `"entry": ["index"]`, so it measures
    what loads with the page (18.04 of 20 kB; 17.35 without the test, so the test costs 0.7 kB).
    `zxcvbnPassphraseTest` keeps no `entry`, measuring the wrapper and its lazy chunks together,
    what a host ships (213.58 of 220). `VaultProvider` 4.53 of 4.7, `reactEverything` 5.01 of
    5.3. No line raised.
  - Tests: core (`passphrase-strength`, `zxcvbn-passphrase-test` incl. scope and loading,
    `browser` incl. an at-once vs on-demand bundle split, `vault`), provider (required test at
    render, reopen on identity, warning, the advice default four ways, the race), and every
    adapter test that opens a vault by hand now passes `TH.anyPassphraseTest`.
  - READMEs (`safebyok` *A new passphrase's strength*, entry points; `safebyok-react` options,
    *When an unlock fails*, *Advice while choosing*, `useVault`), VOCABULARY, changeset (minor
    for both), `notes/security.md` (six entries, by a sonnet subagent).

* **The Coach's principles and rulings**:
  - 1, no weak estimator offered: **met** (`passphraseLengthTest` unexported; no core default).
  - 2, `safebyok/browser` gives a good one: **met** (`browserOpts()` supplies zxcvbn's).
  - 3, override or tweak: **met** for override (pass your own after the spread) and for tweaks
    that ask more (wrap ours: the README shows one). Lowering zxcvbn's score or floor means a test
    of your own; no factory was added.
  - The user's names: **met** (the scope bag). The `logger`-like option: **met**.
    `checkStrengthTest` at render, immutable after: **met**. Advice default: **met**, host wins.
  - Optional peers: **not** -- principle 2 wins (Decisions). 12-character floor: **kept**. Score
    3: **kept**. A throwing host test: **as built** (passes through; in the dialog's advice it
    reaches the dialog's boundary). Weak passphrase during another device's create: **as built**.
  - YOLO 23 (provider read after close): **met**, with two tests that fail without the fix.

* **Decisions taken** (YOLO; each a matter for the Coach):
  - **No test given: refuse, `bad_option`.** Rec: keep. Alternatives were no check (worse than
    weak) or a core default of zxcvbn (ties `openVault` to zxcvbn for every host, against the
    README's "the main entry asks for everything"). Required matches `keyDeriver` and `deviceDB`.
  - **The browser default arrives in `browserOpts()`, lazily.** A dynamic `import()` keeps the
    216 kB out of the page's first load (bundlers split it; proved by a test and the size line)
    while `{...browserOpts()}` is all a host writes. Rec: keep.
  - **zxcvbn stays a dependency, not an optional peer.** Every `browserOpts()` host now imports
    it, and a bundler fails the build on a dynamic import it cannot resolve, so an optional peer
    would make nearly every browser host install two packages by hand or meet a build error --
    not batteries-included. The Coach's worry (an unbundled import loading 1.3 MB) is answered by
    the lazy load; the install-size cost on disk remains for hosts that never use it. Rec: keep
    as dependencies; revisit if a non-browser host complains.
  - **The zxcvbn test is async** (it was sync): the one cost of loading on demand.
  - **Scope split into parts** for user inputs: whole names alone miss a passphrase built from an
    email-like id's words.

* **Deviations**: the advice default lives in `vault-provider.tsx` (`adviceFrom`, internal), not
  the modal, which knows no test. `zxcvbn-passphrase-test.ts` has its own frozen strong verdict,
  so `browserOpts()` does not pull zod in through `passphrase-strength.ts`. No suppressions.

* **Discoveries**:
  - **The flake's cause** (a subagent traced and reproduced it 10 of 10 by holding
    `crypto.subtle.decrypt`): the test *before* the one vitest named. `VaultProbe`'s `void
    withUnlockedVault(read)` was refused `vault_locked`, the dialog unlocked, the run again was
    mid-decrypt when the test ended; cleanup closed the handle; `ensureOpen` threw `vault_closed`
    to nobody. Any action under way across an unmount, sign-out, switch or reopen met the same.
    Now a `vault_closed` on a handle the provider has let go resolves null; one on the handle it
    holds still rejects. No timeout; no demo change.
  - For thread 17: `vault.ts` changes are the option's type and doc, the check's name, the open
    message, and three `ensureStrongEnough(..., scope)` calls.
  - For thread 9: `browserOpts`' size line now has `"entry": ["index"]`; keep it when lowering.

* **For the Coach**: the three Decisions above (refuse with no test; lazy load in
  `browserOpts()`; dependencies, not optional peers). And a behaviour change a host will notice:
  an inline arrow as `passphraseStrengthTest` now reopens the vault each render (warned once),
  per YOLO 17.

* **Review**: two fixes are in (the React README's advice default is `VaultProvider`'s only; a test uses `TH.expectRefusal`); seven minors are recorded in the plan.
