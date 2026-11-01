# Thread 2: deriver_and_strength (2026-11-01)

Branch `20261101-deriver_and_strength`, cut from origin/main, PR #427. Justify: lint, typecheck, test (88 files, 4873 tests) and build green; `size:check` green. An empty changeset: nothing exported changes.

* **Built**: most of the thread was already on main. Confirmed there: `KeyDeriver` as an interface in `src/deriver/basederiver.ts`, `Bank.make`'s `keyDeriver` required with no default, `RefusingStrengthChecker` and `Phrases.NoStrengthChecker`, `notes/configuration.md`, and `zxcvbnStrengthChecker` exported from `src/browser.ts` (`tests/browser.test.ts` covers it). Added:
  - Doc blocks on every export of `src/deriver/`, on `BankOpts` and on `StrengthChecker` (`models-shapes.ts`).
  - `checkKeyDeriver` (basederiver.ts), called in `Bank`'s constructor.
  - `tests/deriver/{shapes,basederiver,argon2id-webv1}.test.ts`: the old deriver tests ported to the new modules, plus `checkKeyDeriver`, `isTestDeriver` and the spec checker.
  - `tests/models/bank.test.ts`: `BankOpts['keyDeriver']` is `KeyDeriver` exactly (a type test), `Bank.make` refuses a missing or non-deriver `keyDeriver`, a supplied-label impostor and warns of a `test_` label; an omitted `strengthChecker` answers `NoStrengthChecker`.
  - `tests/models/bank-reach.test.ts`: `vi.mock` counts loads of `@noble/hashes/argon2.js`; importing `models/bank` loads none, importing `deriver/argon2id-webv1` loads it (the positive control). Checked by mutation: a side-effect import of `argon2id-webv1` in bank.ts turns it red. A TypeScript-program walk was tried first and set aside: the old surface's type-only imports of `key-deriver.ts` put noble in the program though no bundle holds it.
* **Decisions taken**:
  - `checkKeyDeriver` is new. The old `vault-opts.ts` refused a deriver declaring `argon2id` over a bad spec, one wearing a supplied label over other parameters, and one in the reserved namespace; the new `Bank` only warned of `test_` labels, so those got through to a vault that opens nowhere else. It is a function of the deriver module, so thread 3a's gating rewrite does not touch it.
  - `checkSuppliedSpecKept` now takes `Pick<KeyDeriver, 'key_deriver_label'>` (it reads only fields by name).
  - `KeyDeriver.load` is `load?: (() => void | Promise<void>) | undefined`, not a method: the old surface's `KeyDeriver` was not assignable to it under `exactOptionalPropertyTypes`.
* **Deviations**: the sprint scope said `bank.ts`'s option types only; the constructor gained one line (`checkKeyDeriver(opts.keyDeriver)`), for the gap above. If thread 3a or 5 rewrites the constructor, keep the line.
* **Discoveries**:
  - `Bank.hello()` awaits `keyDeriver.load?.()` bare: a failure surfaces as the deriver's own error, where the old `loadKeyDeriver` refused 'unexpected_error' with the error as cause. Left alone (no catch-and-relabel rule); `tryHello` carries it as an Outcome. Whoever builds hello's refusals decides.
  - `keyDeriverShape` (old `shapes/host-code.ts`) still checks `bankOpts.keyDeriver`, and `src/models/` imports the old `shapes/` and `checks/`; the old `key-deriver.ts` KeyDeriver and the new one are two types, assignable one way (old to new) after the `load` change.
  - `pnpm size:budget` reports `raise` on eight entries (everything, Bank, stableJsonify, argon2idWebV1Deriver, idbDeviceDB, browserOpts, BankProvider, reactEverything) with the measures unchanged by this thread (nothing in `models/` ships); the lag is on main. Not written here.
  - The deriver hop for the cleartext: `deriveKeyBytes(passphrase, salt)` hands the string straight to noble, which holds its bytes for the call and cannot be zeroed from here; the key bytes it returns are zeroed by `Proving` (thread 3a / proving), not by the deriver.
* **For the Coach**: nothing needs a ruling; the size-budget lag is the one thing to look at.
