# Thread 12: vault_try (2026-11-20)

Branch `20261120-vault_try`, PR #779, stacked on #778 (minder_try). Proved: `pnpm --filter safebyok test` (1382 pass),
typecheck and lint; safebyok-react's knock-knock test (4 pass); `pnpm justify` pending.

* **Built**:
  * **The read in put is reverted** (`packages/safebyok/src/models/vault.ts`). `#newestAt` is thread 4's again,
    `this.#minder.at(scope) ?? await this.#minder.get(scope)`: a write over a car the minder holds sparse (known from a
    list) writes over that sparse revision, so a patch with no sidecar refuses `bad_record`. Reverses 9cdc7bd0e
    (thread 7, with_whisper). vault.test.ts has thread 4's "refuses a newest cached sparse when the patch gives no
    sidecar" again; the doc lines promising the fetch are thread 4's. `#scopeAt` stays (withWhisper uses it).
  * **Vault write pairs**: `tryPutBoxOnce`/`putBoxOnce`, `tryDelBoxOnce`/`delBoxOnce`. The try form runs the pre-write
    steps (`#newestAt`, `sealBox`/`tombstoneBox`) in `Outcome.outcomeOf`, returns a bad outcome as it is, and otherwise
    returns the minder's `tryWrite` answer as it came (cast to the box type, as `#writeOnce` cast before), so a
    `stale_write` carries its `dbhas`. The thrower is `Outcome.valOf(await this.tryFoo(...))`. `#writeOnce` is gone.
    The full doc block sits on the try form, as on the minder's `tryWrite`; the thrower's says "{@link tryFoo},
    throwing its refusal instead of answering it". Tests: a `tryPutBoxOnce` describe (the @example, `stale_write`
    with `dbhas`, `bank_locked` and a bad labelpath answered and nothing written) and a `tryDelBoxOnce` one.
  * **Bank re-entry pairs** (`packages/safebyok/src/models/bank.ts`): `tryAttemptUnlock`, `tryAttemptReplacePassphrase`,
    `tryAttemptAddPasskey`, `tryAttemptRevokePasskey` are the old outcome-resolvers renamed; `attemptUnlock` and the
    rest are new throwers through `Outcome.valOf`, resolving the bank. Callers renamed (bank-prompts, bank, device,
    vault tests; safebyok-react's knock-knock test). One new describe in bank-prompts tests each thrower once.
    VOCABULARY.md (vault row, prompt/re-entry row), notes/wontfix.md and notes/guarantees-drift.md (an amendment line)
    updated. notes/security.md: a `sonnet` subagent amended the `bank_gatings` entry in place (the header says an entry
    covering the same mechanism is amended, not duplicated); it added a line only.
  * **Swept-while-waiting tests deleted**: bank-prompts' "refuses 'disabled' when the device is swept while it waits
    out a gate change" and "resolves 'disabled' when the device is swept while it waits out a gate change". The
    `demandEnabled` after the wait and the test of a bank already swept on entry stay.
  * **`LeaseFormat` is `'a007102'`** (`packages/safebyok/src/shapes/shapes-stamps.ts`), was `7102`. A lease is never
    stored: its `fmt` is only bound into the in-memory wrap of its bankKey, so no record fails and nothing migrates.
    ctx-bytes test quotes it; lease.test's malformed table has an off-format string and the old number.
  * Changeset `.changeset/20261120-vault_try.md` (empty: safebyok is private).

* **Decisions made**:
  * **Misuse in the try forms is a bad outcome**, not a throw, matching thread 11's minder (`tryGet`, `tryList`,
    `tryWrite`), whose open matter on this is pending the Coach. The Bank's try forms already answered so.
  * **The string `'a007102'`**: no rule derives `'a010501'` from `100_501`, so I kept the lease's digits behind the
    same `a` and a six-digit pad, distinct from the Thing's format and greppable. Any distinct string serves.
