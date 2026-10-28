# Thread 1: heed_inline (2026-10-28)

Branch `20261028-heed_inline`, PR pending, cut from `origin/main` at f84d61bb. Justify: green (core 3473 passed, 37 skipped; every package green; size budgets unchanged).

Closes the open half of the Coach's GW-11: `RefusalPolicy.heed` is gone, and the vault meets each
storage refusal at the site that met it.

* **Built**:
  * `packages/safebyok/src/refusal-policy.ts` keeps only `decide` and `RefusalResponse`.
    `heed`, `HeededVaultDB` and `heard` are deleted (none was exported from `src/index.ts`).
  * `Vault.#vaultDB` is a plain `VaultDB`. Its six sites (`tryDelBox` in `delBox`, `tryGetVault`
    in `#takeStorage`, `tryDelVault`, `tryPutVaultRecord` in `#putGate`, `tryGetBox` in `#getBox`,
    `tryPutBox` in `#putOver`) call the `try` form, and on `! outcome.ok` await
    `#onStorageRefusal(outcome)` before anything is made of the refusal. The field's comment says
    every site calls the `try` form, as a convention a reviewer can grep.
  * `#heedRefusal(refusal: VaultError)` is `#onStorageRefusal(refused: BadOutcome)`: the same body,
    reading `refused.err`. Its doc block states the ordering guarantee: every site awaits it on a
    refusal before it throws, so the lock has landed and the lease is erased by the time the
    caller hears.
  * `#takeStorage`'s `behind` branch builds `bad(behindError())` and goes through the same call.
  * `#putOver` answers `Outcome<BoxRecord>` (maps `vault_mismatch` to `stale_write` as a bad
    Outcome), so `#sealAndPutBox`'s `outcomeOf(() => this.#putOver(box))` rewrap goes too.
  * Tests: `tests/refusal-policy.test.ts` keeps `decide`'s cases. `tests/vault/vault-storage.test.ts`'s
    "when storage says the user is no longer signed in" gains `delBox()` and `del()` in its
    "locks at once" cases (one per verb now), and a new latch test per direct call, "has locked, and
    erased this device's lease, before the caller of X hears the refusal", holding `tryDelLease`'s
    answer with `TH.holdNextAnswer` and checking the caller has not heard. Verified to fail when a
    site's `await` is made a `void`.
  * `notes/security.md`: four sentences amended inline by a sonnet subagent, per the file's header.
    `notes/old_vocabulary.md`: the `HeededVaultDB` row says it is gone.
  * Changeset `.changeset/20261028-heed_inline.md`, `safebyok` patch: host-invisible.

* **Decisions taken**:
  * At four sites (`delBox`, `#putGate`, `#getBox`, `#putOver`'s caller) the throw stays *after*
    `#demandAfterWait`, as before: a vault that moved on meanwhile refuses as the demand finds it
    (`vault_gone`, `gate_moved`), never as what storage found. So the site reads
    `try` -> `if (! ok) await #onStorageRefusal` -> demand -> throw. `#delVault` and `#takeStorage`
    are the Coach's bare react-then-throw.
  * `#onStorageRefusal` is the Coach's suggested name; a reader sees at each site that a storage
    refusal has a plan, and the doc block says the plan is a lock for untrusted storage.
  * `#putOver` was converted to answer an Outcome rather than left throwing: it was the one
    remaining unwrap-then-`outcomeOf`-rewrap, the thing GW-11 is about.
  * The `#takeStorage` `Promise.all` now resolves both reads before the reaction runs (the `try`
    form never rejects), where the heeded `getVault` rejected the `Promise.all` as soon as it
    refused. The lease read's answer is discarded either way.

* **Discoveries**:
  * Three `gating.test.ts` tests (`refuses del() vault_locked when a lock()/decline() lands while
    the deletion's write is sent...` and the `requestCleartext throws` one) mocked `tryDelVault`
    with `mockRejectedValueOnce`: a `try` form that rejects, which the contract says cannot exist.
    The `outcomeOf` rewrap had caught that rejection; the plain `await` let it out past the demand.
    The mocks now resolve `bad(...)`. `tests/vault/vault-twins.test.ts:138` still has `tryGetBox`
    reject on purpose (a foreign throw becomes `unexpected_error`), and still passes.
  * A gating's waiters (`putWayin`, an unlock) hear a lock-worthy refusal when `#onStorageRefusal`
    lands the gating, which is *before* it awaits `tryDelLease`. The guarantee heed gave was for
    the verb's direct caller; the waiters' order is unchanged by this thread, and the latch test
    says so and leaves them out. Whether the waiters should also wait for the erase is a question
    for the Coach (below).

* **For the Coach**:
  * **`#heardRefusal`**: still the name of the two-forms helper (maps a throw to a `VaultError`,
    tells the news). With `#heedRefusal` gone it no longer has a twin; it reads oddly alone, but
    the fix is a rename of 16 sites. Recommendation: leave it; if renamed, `#refusalTold(thrown)`.
  * **Gating waiters and the erase**: see Discoveries. Recommendation: leave as is; the lock has
    landed, which is what the waiter acts on.
  * **`notes/security.md:854`** names `#heedRevocation`, which no longer exists in `src/` (stale
    before this thread). Recommendation: a later docs pass, not this PR.
  * **Rejecting `try`-form mocks**: a lint or helper could refuse `vi.spyOn(x, 'try...').mockRejected*`
    as `spyOnDeviceHook`'s doc already warns. Recommendation: not worth a rule; note it.
