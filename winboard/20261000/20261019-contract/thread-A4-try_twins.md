# Thread A4: try_twins (2026-10-19)

Branch `20261019-try_twins`, [PR #198](https://github.com/mrflip/safebyok/pull/198), stacked on [#197](https://github.com/mrflip/safebyok/pull/197) (`20261019-fields_and_make`). Justify: green; 4256 tests, 193 skipped (live backends), 0 failed.

* **Built**:
  * `packages/safebyok/src/vault.ts`: every public async call is a pair. Its body is a private
    field, `readonly #tryX = this.#trying(async (...) => { today's body })`, followed by
    `tryX = this.#tryX` (a short doc) and `X = this.#throwing(this.#tryX)` (the call's long doc,
    unchanged but for `addPasskey`'s and `hello`'s). `#trying` is `outcomeOf` over the body, a
    throw that is no VaultError said as `unexpected_error`, and the bad news the outcome refuses
    with told (`#hearBadNews`; the `WeakSet` keeps it once per error). `#throwing` is `valOf` over
    it. A3's `#tellingBadNews` is folded into `#trying`. New section `[Two forms]`.
  * `getWhisper(boxlabel)`: `valOf` over `#tryGetBox`, no `try` form. `useBox` reads through
    `#tryGetBox` too; its callback runs outside, so a callback's throw is never told or wrapped.
  * `tryClose()` answers an `Outcome` at once (never refused); `close()` is `valOf` over it.
  * `outcome.ts`: `outcomeOf(thunk, otherwise = Refusals.storageUnavailable)`, `unexpectedError`,
    `isOutcomeShaped`. `errors.ts`: kind `unexpected_error`, family `misuse`. `index.ts` exports
    `valOf` and `unexpectedError`.
  * `vault-db.ts`: each verb is `answering(...)` (`outcomeOf(body, unexpectedError)`); each `do*`
    call goes through `adapterAnswer('doX', ...)`, where a throw is `storage_unavailable` as before
    and an Outcome-shaped answer is `bad_option`, saying to unwrap with `valOf`.
  * React: `VaultProvider`'s hello, `PassphraseModal`'s unlock and start-over, and
    `PasskeyUnlockButton`'s unlock call `tryHello`, `tryUnlock` and `tryDel`. `close()` stays: it
    cannot be refused. The test `stubVault` builds each `try` form from the throwing one handed in.
  * Demo: `OutageVaultDB` unwraps with `valOf`; its `answered` shim is gone.
  * Docs: README *Errors* (the two forms, the retry predicate, the new kind's row), VAULTDB.md
    (bugs, unwrapping, `subscribe`), the `Vault` class doc. `notes/security.md` via a sonnet subagent.
* **The pairs** (for phase C: every body below still throws internally, wrapped by `outcomeOf` in
  `#trying`, except `tryClose`, which answers natively):

  | `tryX` | `X` | `val` today | Body still throws | Likely flipped by |
  | --- | --- | --- | --- | --- |
  | `tryHello(opts?)` | `hello` | `Vault` | yes | A6 (`ensureLease`), C |
  | `tryUnlock(proof, opts?)` | `unlock` | `void` | yes | A6 (`attempt`) |
  | `tryLock()` | `lock` | `void` | yes | C5 |
  | `tryChangePassphrase(proof, new, opts?)` | `changePassphrase` | `void` | yes | B4 (`putWayin`) |
  | `tryAddPassphrase(proof, new, { wayinlabel })` | `addPassphrase` | `string` | yes | B4 |
  | `tryAddPasskey(proof, make, { wayinlabel })` | `addPasskey` | `string \| null` | yes | B4 |
  | `tryDelWayin(proof, wayinId)` | `delWayin` | `void` | yes | B4 |
  | `tryPutBox(boxlabel, whisper, opts?)` | `putBox` | `void` | yes | C2 |
  | `tryGetBox(boxlabel)` | `getBox` | `Whisper` (a `Box` from C4) | yes | C4 |
  | `tryDelBox(boxlabel)` | `delBox` | `void` | yes | C3 |
  | `tryDel()` | `del` | `void` | yes | C5 |
  | `tryClose()` | `close` | `void`, synchronous | no | C5 |

  Throwing alone: `getWhisper` (over `#tryGetBox`), `useBox` (callback), `subscribe` (answers at
  once), `Vault.make` (no vault to answer from), `delDamagedVault` (a free function; its `try`
  form is phase C's).
* **The five carried decisions**, each built to its Rec, each easy to reverse:
  1. **`valOf` exported** under that name, beside `unexpectedError`; the demo's `answered` is gone.
  2. **`outcomeOf` and bugs.** Rule: *a throw that is no VaultError is `storage_unavailable` only
     where an adapter's own code ran*; everywhere else it is the new `unexpected_error` (misuse:
     fix the code, never retry). So the base wraps just the `do*` call (`adapterAnswer`), and both
     the base's verbs and the vault's `tryX` say anything else as `unexpected_error`. Why: the
     base cannot tell an adapter's bug from a driver's failure (`fetch` fails with a `TypeError`),
     so adapter code keeps the retryable reading; but a TypeError in safebyok's own checks, or a
     host's strength test throwing, would otherwise be retried forever. Why a new kind and not
     `bad_option`: "fix your options" would mislead for safebyok's own bug. Rejecting instead (a
     "defect" escaping, as Effect does) would break the ruling that nothing is thrown past the
     boundary. **Not logged**: a host function that threw (strength test, key deriver) was handed
     the passphrase, so its throw may quote it; the cause still reaches the caller. Also: a
     VaultError of another copy of safebyok (ESM and CJS side by side; a zxcvbn test met it) is
     kept as it came, by `name` and a known `refusalkind`.
  3. **The runtime guard** is `adapterAnswer`: an answer with a boolean `ok` beside `val` or `err`
     is refused `bad_option`. It also closes a quieter hole: a wrapped `{ ok: false }` from
     `doPutVaultProps` or `doDelVault` was truthy, and read as landed.
  4. **`subscribe` stays a synchronous throw**, documented on the vault's and the base's
     `subscribe`: it answers at once with what `useSyncExternalStore` wants, and an Outcome there
     would make every caller unwrap an unsubscribe.
  5. **`hello` as a bare handler**: an object that is no plain bag (`isPlainBag`, now exported
     from `types.ts`) is ignored, so a DOM or React event works; a primitive or a misspelt plain bag
     is still `bad_option`. Its type takes `AnEvent = { readonly type: string }` so the handler
     typechecks.
* **Decisions taken**:
  * **`X` calls the private `#tryX`**, so a host writing over `vault.tryUnlock` changes only what
    it calls itself; the public arrow fields stay writable (A3's rule: the vault never reads its own
    state back through a public property). The body sits above the pair, since a field's
    initializer can reference only fields before it; the docs sit on the public pair.
  * **Long docs stay on `X`**, written as they were in throwing terms; `tryX` has a short doc,
    and the class doc says how the two map. Phase C, writing each call to its Contract section,
    moves the doc to `tryX`.
  * **`tryClose` is synchronous**: `close()` must stay synchronous for react's cleanup and the
    tests' bare `vault.close()`; `await vault.tryClose()` works all the same.
  * **`getBox` keeps returning the whisper** until C4, so `getWhisper` and `getBox` agree today.
* **Deviations**: `heed` (`RefusalPolicy`) stays, as the handoff allowed: no pair made it
  trivially removable.
* **Discoveries**:
  * A `#private` member in the VaultDB base's verbs breaks a duck-typed store
    (`Object.create(vaultDB)`, tested in `vault-make.test.ts`): helpers there stay free functions.
  * `no-misused-promises` flags `addEventListener('focus', vault.hello)`; the test carries an
    `eslint-disable-line` for it. A host on that rule meets the same.
* **For the Coach**:
  * **`unexpected_error`**, a new refusal kind, misuse. Recommend: keep.
  * **Contract drift**, proposed text in [thread-A4-try_twins-drift.md](thread-A4-try_twins-drift.md).
* **Test counts** (vitest JSON reporter per workspace; *total* includes skipped): 4205 (193 skipped)
  at base `f924b90e`, 4256 (193) at the tip. Moved, every other file the same: core
  `tests/vault/vault-twins.test.ts` 0 to 38, `tests/outcome.test.ts` 10 to 17,
  `tests/vault-db.test.ts` 291 (17) to 296 (17), `tests/errors.test.ts` 58 to 59; core 2281 to
  2332. React stays 231: five tests retitled and re-asserted for `unexpected_error`, the
  passkey-race spy now on `tryUnlock`. `vault-wayins.test.ts`' strength-test throw now expects
  `unexpected_error`. The pairs are proven by one table (`TwinCases`): per pair, the `try` form's
  `err` and the throwing form's refusal agree in kind, message and family, and its `val` matches;
  "throws, from the throwing form, the very refusal it told onBadNews" proves identity through
  the handler.
* **Size**: `pnpm size:budget --write` moved `everything` 40 to 41 kB; the rest held.
* **Looked up**: the preplan's C-phase and B3 texts (`getWhisper`, `useBox`, C4) and the progress
  doc's *Interim shims standing*.
