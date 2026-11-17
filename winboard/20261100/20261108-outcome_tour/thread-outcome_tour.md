# Thread outcome_tour: outcomeOf and valOf where a throw or an outcome is made to be unmade (2026-11-08)

Branch `20261108-outcome_tour`, PR #605, cut from local `20261108-coach_tip` (878c43cfe: three commits with no PR of their own, which show on this PR). PR base `main`. Justify green: core 2589 tests, whole repo green, size budgets met.

* **Built**: `demandGood(outcome, refusal?)` in `packages/safebyok/src/refusals/outcome.ts` beside `valOf`, internal (exported from no entry point), with three tests in `tests/refusals/outcome.test.ts`. Six sites changed (table in the PR).
* **Decisions taken**:
  * `Lease.#vaultKey` and `Proving.checkOpens` become a try/catch round their one WebCrypto call, as `Lease.#opened` already is. The old `outcomeOf(..., damagedLease|wrongProof)` passed a VaultError through; the catch now relabels every throw. Nothing in `unwrapKeyUnder` (`fromB64`, `crypto.subtle.unwrapKey`) throws a VaultError, so no reachable behaviour moves. `#vaultKey` keeps its order: lock, evict, then throw.
  * No `demandGood` call passes `refusal`: the parameter is unused in `src/` (the tests exercise it).
  * No changeset beyond `--empty`: nothing a host sees changed.
* **Left alone, and why** (the PR's Open questions carry the same list):
  * `AdapterVaultDB` (`storage/vault-db.ts`): the 12 throwing verbs hold the body and build a VaultError with `meta`; each `try*` is `answerOf(() => this.verb())`, which unpacks that `meta` into the Answer. The rule says a method whose Outcome carries `meta` is implemented on the try side. Moving it is a rewrite of every verb and of the thrown error's `meta`: left. `graphql-vault-db.ts` `answerOf` is the same shape.
  * The `LeaseFriend` has only try forms, so `Lease.vacate` is `demandGood(await friend.tryForgetLease())`, over `deviceDB.tryForget`, which is `outcomeOf(forget)`, whose body throws. A throwing `forgetLease` on the friend would end the loop but changes the friend interface and its test fakes: left.
  * `listing.ts` `deliver` and `#onNotice` (`outcomeOf` feeding `tellBadNews`): no machinery near fate; the relabel of a non-VaultError as `unexpected_error` is also wanted.
  * `Vault.tryDelDamagedBox`: a large throwing-style body inside `outcomeOf`, with no throwing form on purpose. It returns an Outcome, so `outcomeOf` is right.
  * `Gating.#attemptOnce`, `Bank.tryHello` / `Vault.tryHello` bodies (`hello` announces the outcome, then throws via `demandGood`), graphql `gateRefusalOf` and `watchNotices`: the immediate consumer needs an Outcome.
  * `valOf` with a used value: `Gating.launch`, `VaultListing.#deliverStored`.
  * `graphql-vault-db.ts` `goodAnswerOf`: a hand-rolled demand over an Answer, typed to return `GoodAnswer`; `demandGood` returns `GoodOutcome`.
* **For the Coach**: whether to keep `demandGood`'s `refusal` parameter, unused in `src/`; the three left-alone decisions above that were close (VaultDB, LeaseFriend, tryDelDamagedBox).
