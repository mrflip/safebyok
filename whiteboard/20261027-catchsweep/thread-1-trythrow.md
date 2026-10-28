# Thread 1: trythrow (2026-10-28)

Branch `20261028-trythrow`, PR [#316](https://github.com/mrflip/safebyok/pull/316), on main ([#311](https://github.com/mrflip/safebyok/pull/311), it was stacked on, merged).
Justify: green (safebyok 3445 tests passed, 37 skipped; every package's lint, typecheck, build and size budget green).

Catch-up rebase at filing, 2026-10-28: #311 and then [#301](https://github.com/mrflip/safebyok/pull/301)
(validator_ducks) merged under the branch. #301 moved the shape validators into `src/shapes/` and
replaced the `checked*` helpers `lease.ts` and `box.ts` called, so the conflict was in the five
try pairs this thread moves: resolved by keeping thread 1's structure (body in the throwing
method, the `try` form one hop) with main's names inside it (`serializedBytes.parse`,
`BoxSparse.parse`, `CipheredShape.parse`, `LeaseSealProps.parse`, `SealBoxProps.parse`,
`MadeShape.parse`, `BoxRecord.parse`, `VaultOfBox`). The inner AEAD `outcomeOf` calls are as
they were. No behaviour from either side was dropped; no repair commit was needed.

The Coach's naming rule of 2026-10-27: a function resolving an Outcome is `tryVerbFoo`, one that
throws or returns the foo is `verbFoo`, and the body lives in the throwing one. Behaviour is kept:
the same demands in the same places relative to each await, the same zeroing in the same `finally`
and `catch` blocks, the same refusal kinds. No cryptographic line changes. Every test that stood
before passes unchanged.

* **Built**:
  - `packages/safebyok/src/lease.ts`: `cipheredWith`, `decipherWith` and `sealProps` hold their
    bodies and throw; `tryCipheredWith`, `tryDecipherWith` and `trySealProps` are each one
    `outcomeOf(() => this.x(...))` hop over them. The inner `outcomeOf` calls (the AEAD mapping to
    `damaged_box` and `unexpected_error`) moved whole, untouched, for thread 2.
  - `packages/safebyok/src/box.ts`: `Box.seal` and `box.extractWhisper` hold their bodies;
    `trySeal` and `tryExtractWhisper` are one hop over them. `extractWhisper` still calls
    `lease.tryDecipherWith`, and `Box.seal` still calls `lease.trySealProps`, as both read the
    outcome's `ok` to pick the half of the demand that follows.
  - `KeptLease.read` is `KeptLease.tryRead` (`lease.ts`), at its callers in `vault.ts` (`#takeStorage`,
    `#takeUpFromPantry`) and `bank.ts` (the birth read), in `device-db.ts`'s doc for `getLease`, and in
    `notes/guarantees.md`. No throwing `read`: each caller `valOf`s the outcome only after a
    `Promise.all` or a demand, so none wants one.
  - `notes/guarantees.md` names the methods that now hold the bodies (the vaultKey, boxKey and
    whisper access points; G5, G6).
  - Changeset `.changeset/20261028-trythrow.md`, patch.
* **Decisions taken**:
  - The `try` form is `return await outcomeOf(() => this.x(...))`, not the written-out
    `try { return good(await this.x()) } catch (err) { return bad(...) }`: `outcomeOf` is exactly
    that try/catch with today's mapping of a non-VaultError to `unexpected_error`, and the plan's
    *Ground rules* name the one-hop closure as the form `outcomeOf` is applied in, once, at a
    public method. Writing its body out five times would be a second implementation of it.
  - Patch changeset, not empty: the flip changes what the throwing form throws for a bug (below).
* **Deviations**: none from the handoff.
* **Discoveries**:
  - **A throw that is no VaultError now leaves the throwing form raw.** Before, `cipheredWith` was
    `valOf(await this.tryCipheredWith())`, so a TypeError inside arrived as a VaultError
    'unexpected_error'; now it leaves `cipheredWith` as thrown, and only `tryCipheredWith` maps it.
    Inherent in the Coach's rule as glossed; every refusal (a VaultError) is unchanged, and the
    host-facing Vault and Bank throwing forms are still `valOf(await this.tryX())`, so they still
    map. Named in the changeset.
  - `vault.ts` and `bank.ts` pairs (18 and 5) keep the body in the `try` form, in a hand
    `try`/`catch` whose `#badOutcome` tells bad news to listeners and maps a non-VaultError;
    `Vault[provingTools]` also hands `#badOutcome` to the proving. **Not flipped**, as the handoff
    says. A flip that keeps the news on both paths exists: the throwing form holds the body and ends
    `catch (err) { throw this.#heardRefusal(err) }` (tell, map, rethrow a VaultError), and the `try`
    form is one `outcomeOf` hop; one catch, news told once. Recommendation: a thread of its own,
    after the Coach rules on the raw-throw matter above, since that form would make Vault and Bank
    throwing forms always throw a VaultError while Lease and Box ones let a bug through raw.
  - Thread 2's inner `outcomeOf` calls are where they were, one indent level up.
* **For the Coach**:
  - **Raw non-VaultError from Lease and Box throwing forms**: accept (recommended), or have each
    throwing form catch and map to 'unexpected_error' too, which puts a second wrapper on the edge.
  - **Vault and Bank pairs**: leave as they are for now (recommended), or a follow-up thread in the
    one-catch form above.
