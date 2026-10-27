# Thread 19: bag refusals (2026-10-27)

Branch `20261027-bag_refusals`, PR #TBD, stacked on #301. Justify: see PR.

* **Built**: `parseVaultBag` is retired from `packages/safebyok/src/bank.ts`; `#vaultScopeOf` calls `vaultBag.parse(bag)`, so a bad bag refuses 'bad_scope' with the `Validator`'s own message and no hint about stores. `otherScopeError` now reads "This names another <fields> than the bank's, which serves one app and one signed-in user. Name the vault by its vaultlabel."; its check, 'bad_scope' kind and `meta.fieldnames` are unchanged. Tests asserting the old wording follow (bank.test.ts); a changeset (patch) says the two messages are shorter.
* **Decisions taken**: `vaultBag.parse` example in `shapes/scopes.ts` said "stores go in the second bag" as the refusal; it now says "a field it does not take", which is what the validator says.
* **Deviations**: none.
* **Discoveries**: the Bank class doc block still tells the reader that stores go in the second bag; that is guidance about the API, not a promise of message wording, so it stays.
* **For the Coach**: `vaultBag` stays strict; whether it becomes a duck that takes a Vault object is still open.
