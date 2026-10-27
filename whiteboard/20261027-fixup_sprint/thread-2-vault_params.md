# Thread 2: vault_params (2026-10-27)

Branch `20261027-vault_params`, PR pending, stacked on #297. Justify: not yet run (single-file
lint, tsc and the touched tests green at each commit).

Builds `fixup-preplan.md` items 5 and 8 (in the sprint's folder). Items 5a to 5e are built; 8a
to 8e are next.

* **Built**:
  - 5a: `#readBox`, `#storedBase`, `#updateBoxListingOf` and `#boxUnder` (vault.ts) take no
    `vaultTok`; their storage expectations, and `delBox`'s, read `this.vault_tok`.
  - 5b: the two demands right after `#boxUnder` are gone. `#storedBase`'s demand after
    `#readBox` stays, by the ruling.
  - 5c: `Proving.#unwrap(usage)` reads `#currentWrap()` and `this.header` itself, first.
  - 5d: `Gating.#freshGatedRecord()` freshens and refuses a novel record, for the six chains.
  - 5e: `Bank.#vaultPartsFor(bag, opts)`.
* **Decisions taken**:
  - 5a: `#sealAndPutBox`'s `#writeOver` expectation and its demand after the write keep
    `box.vault_tok`: the expectation pairs it with `box.baseRevisionTok`, one unit from the box,
    as the preplan keeps `#delVault`'s and `#putGate`'s pairs.
  - 5e: `#vaultPartsFor` serves `ensureVault` and `reopenVault`, the two sites that wrote the
    whole expression. `clearCachedVault` and `delDamagedVault` need the scope on its own too
    (for the device store and `delDamagedVaultIn`), so they keep `const scope =
    this.#vaultScopeOf(bag)` and call `vaultPartsOf(this.#parts, scope, opts)`; going through the
    worker there would check the bag twice, or hand a host's store the whole parts as its scope.
* **Discoveries**:
  - 5d adds one microtask between `freshen`'s demand and the chain's next step, as an async
    worker does. Each chain's next primitive demands first, so nothing is decided on a record
    the demand has not seen.
