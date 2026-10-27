# Thread 2: vault_params (2026-10-27)

Branch `20261027-vault_params`, PR #299, stacked on #297. Justify: green (core 3,398 passed and 37 skipped; root 266; every other package green; no size budget moved).

Builds `fixup-preplan.md` items 5 and 8 (in the sprint's folder), one commit per item. What 5f
and 8f keep stays. No export or stored shape changes; the changeset is empty.

* **Built**:
  - 5a: `#readBox`, `#storedBase`, `#updateBoxListingOf` and `#boxUnder` (vault.ts) take no
    `vaultTok`. Their storage expectations and demands, and `delBox`'s, read `this.vault_tok`.
  - 5b: the two demands right after `#boxUnder` are gone. `#storedBase`'s demand after
    `#readBox` stays, by the ruling.
  - 5c: `Proving.#unwrap(usage)` reads `#currentWrap()` and `this.header` itself, as its first
    step, before the wait.
  - 5d: `Gating.#freshGatedRecord()` freshens and refuses a novel record, for the six chains.
  - 5e: `Bank.#vaultPartsFor(bag, opts)`.
  - 8a: `#boxUnder` is inlined as `Box.make(this, record, vaultSparseOf(this.#vaultRecord))`.
  - 8b: `#leaseInForce(now = clock): Lease | null`, used by `consistentWith`, `#picture`,
    `#leaseRefusal` and `#ensureUnlocked`'s drop. `#unlockStands` is gone, and
    `#leaseStandsPast` is now `#leaseLastsPast`.
  - 8c: `#holdLease(lease)` holds a lease: the four lines. The grant reaches it through the
    proving tools as `this.#holdLease(Lease.make(this, stored))`, and both take-ups call it.
  - 8d: `#damagedBase` is `#listedBase` cut down to `{ revision_tok }`.
  - 8e: new internal `src/text.ts` with `codePointsOf` and `byCodeUnit`, tested in
    `tests/text.test.ts`. mask.ts, zxcvbn-strength-checker.ts, vault-db.ts, vault.ts and
    bank.ts import from it. Nothing in `index.ts`, `utils.ts` or `browser.ts` changes.
* **Decisions taken**:
  - 5a: `#sealAndPutBox`'s `#writeOver` expectation and its demand after the write keep
    `box.vault_tok`. The expectation pairs it with `box.baseRevisionTok`, one unit from the box,
    just as the preplan keeps `#delVault`'s and `#putGate`'s pairs.
  - 5e: `#vaultPartsFor` serves `ensureVault` and `reopenVault`, the two sites that wrote the
    whole expression. `clearCachedVault` and `delDamagedVault` also need the scope by itself, for
    the device store and `delDamagedVaultIn`. So they keep `const scope =
    this.#vaultScopeOf(bag)` and call `vaultPartsOf(this.#parts, scope, opts)`. Using the worker
    there would check the bag twice, or pass the whole parts object to a host's store as its
    scope.
  - 8c: no `#fittingLeaseOf`, the step the preplan left to the builder. The two take-ups' warnings
    differ (the gating's "not taken up", the birth's "born locked"), so one worker would take a
    message parameter just to vary its text. Each take-up stays readable on its own.
  - 8b: `#ensureUnlocked`'s drop reads `this.#lease !== null && this.#leaseInForce() === null`.
    `#leaseRefusal` drops an ended lease the same way.
* **Deviations**:
  - 8e: `codePointsOf` keeps `text.match(/./gsu) ?? []`, not the preplan's `[...text]`. The linter
    refuses a spread of a string (`@typescript-eslint/no-misused-spread`) and also refuses
    `Array.from(text)` (`unicorn/prefer-spread`). The regex passes both without a suppression,
    and it is what both old copies wrote.
  - 8e: `byCodeUnit` had three users, not the preplan's two: vault-db.ts's `byBoxlabel`,
    vault.ts and bank.ts. All three import it from text.ts.
* **Discoveries**:
  - 5d adds one microtask between `freshen`'s demand and the chain's next step, as any async
    worker does. There was already one, where `freshen` resolved. Each chain's next primitive
    demands first.
  - 5b holds because a Box takes its scope, `vault_tok` and epochs only from `madeUnder`
    (box.ts's constructor). A box made from `vaultSparseOf(this.#vaultRecord)` therefore cannot
    disagree with that record.
