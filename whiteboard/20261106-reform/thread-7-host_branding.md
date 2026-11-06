# Thread 7: the host functions, branded (2026-11-06)

Branch `20261106-host_branding`, PR (opening), stacked on #550 (thread 6). Justify: green; safebyok 66 files, 2201 tests.

* **Built** (`b4dec015c`):
  * `Bank`'s constructor wraps each host function once, and holds only the wraps: `keyDeriver = guardKeyDeriver(..)` (`models/proving.ts`), `strengthChecker = guardStrengthChecker(..)` (`helpers/passphrase-strength.ts`), `askUser = guardRequestCleartext(requestCleartext)` and `panic = guardOnPanic(onPanic)` (`models/bank.ts`, beside a module-local `HostChecks`). `onBadNews` stays as it was.
  * One brand for all four: `IsGuarded`, `isGuarded`, `brandGuarded` in `helpers/consts.ts`. A non-registered symbol, set as a getter by `defineProperty` (not enumerable, so neither a spread nor JSON carries it), then frozen.
  * `VX.vaultWorld` holds `askUser` and `panic` (no `requestCleartext`, `onPanic`); `GX.provingWorld` holds the guarded `keyDeriver` and `strengthChecker`. Each refuses a function without the brand (`Phrases.GuardedExpected`). `VaultWorld`'s Pick follows.
  * `askUser(gating)` answers true once the dialog closes, false if it threw, and never throws; `Gating.#askHost` picks `gatingDeclined` or `requestCleartextThrew`. `panic(refusal)` answers false with no `onPanic` (after `reportToPlatform`), true otherwise, a throw going to the platform; `Vault.#panic` vacates on false, and `Bank.#eraseLease` calls it with no vault to vacate. `Bank.#panic` is gone.
  * The strength checker is checked once, its scope parsed per call. `invokeStrengthChecker` and `loadStrengthChecker` are gone into the wrap and its `load`.
  * The deriver's wrap checks `CX.keyDeriverShape` once and keeps `key_deriver_label`, `salt_bytes`, `deriveKeyBytes`, `load`. Its `load` refuses as the strength checker's does: `keyDeriverLoadFailed`, `unexpected_error`, the throw kept as cause (a new phrase, `KeyDeriverLoadFailed`). This is the visible behaviour change: a failed deriver `load` used to pass as it came.
  * `Phrases.BadNewsHandlerThrew` deleted. New exported types, each named by Bank's public props: `AskUser`, `Panic`, `PanicHandler`, `BadNewsHandler`, `GuardedKeyDeriver`, `GuardedStrengthChecker` (src/index.ts).
  * `notes/guarantees.md`: the file table, the host paragraph, the passphrase chain, G1, G8 and G9 and the derivation bullet name the wraps, made once in Bank's constructor. Only the strength checker's wrap reaches `refusalFor`; G8's doubled `requestCleartextThrew` clause is gone.
* **Decisions taken**:
  * Each wrap lives beside the code that used to guard it: the deriver's in proving.ts, so the G1/G8 site (`deriveKeyBytes`) stays put; the checker's in passphrase-strength.ts; the dialog's and panic's in bank.ts, as only Bank makes them.
  * Handrolled host-facing types: `AskUser`, `Panic`, `PanicHandler`, `BadNewsHandler`, `GuardedKeyDeriver`, `GuardedStrengthChecker`. In-repo bags stay inferred (`ProvingWorld`, `VaultWorld` as Picks).
  * Tests: `makeVaultWorld` keeps a `requestCleartext` on its `FakeBank`, and its `askUser` reads that at each call, so the ~15 tests that swap `fakeBank.requestCleartext` stay as they were. `provingWorldOf` takes the raw functions and guards them.
  * `checkSuppliedSpecKept` kept: it is reached only from our `argon2idDeriver(spec)` factory and guards our own `argon2id_web_` label namespace, which is no policing of a host's choices.
  * The logger keeps its WeakSet brand. Replacing the `loggerShape` checks in the worlds with the brand is left to thread 8 (`checkers_once`).
* **G1/G8 checked** (guarantees.md, *The guarantees*): the deriver still hears the passphrase only as an argument of `deriveKeyBytes`; its throw is still replaced (`keyDeriverThrew`), never kept; the key bytes are still checked and zeroed in `passphraseKeyOf`. The checker's throw still goes through `refusalFor`. The dialog's throw is dropped, unread. The deriver's `load` hears no passphrase, so its throw is kept as a cause.
* **Suppressions**: none added. proving.ts's `@ts-expect-error` in `isSafelyAllZero` is pre-existing.
