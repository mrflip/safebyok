# Thread 25: vault_enabled (2026-11-13)

Branch `20261113-vault_enabled`, PR [#695](https://github.com/mrflip/safebyok/pull/695), stacked on
[#693](https://github.com/mrflip/safebyok/pull/693) (cut at 2da17e71f). Justify: green (safebyok
2961, indexeddb 194, postgres 209, react 262, fastkey 43, convex 300, graphql 403, demo-react 99,
e2e 540, scripts 287).

The Coach: "let a deleted vault and box stay enabled". This undoes only the part of thread 20
([#691](https://github.com/mrflip/safebyok/pull/691)) that disabled a deleted Vault.

* **Built**:
  * `src/models/vault.ts`: removed the `isEnabled` (`&& this.isPresent`) and `demandEnabled`
    overrides, and the `boxListing` getter's `demandPresent()`.
  * `align` now lets go of `#boxListing` when its `vault_tok` is not the vault's, not whenever
    the vault is absent.
  * #691's delisting, the discarded box listing and its watch, and the list-change notices all
    stay.
  * Tests: those #691 turned to `vault_gone` go back.
  * New tests:
    * in vault-boxes, list, fetch and del under a tombstone refuse `absent_vault`
      (`meta.act` `vault_gone`), and put refuses `vault_gone` without calling storage;
    * in vault-listing, a second `vault.del` refuses `absent_vault` (`dubdel`), and a new life
      made elsewhere is taken on by the vault's fetch and hydrate;
    * in bank-ending, a watch begun by hand on the tombstone's listing survives `bank.lock()`
      until the next life.
  * Docs: README vault entry; VOCABULARY's *kept* row; design-models (the 🪦 legend,
    `vault.get ifAbsent:nil`, `vault.align`); deliver-contract L6 and W2; #691's
    listing_membership changeset.
  * Changeset `20261113-vault_enabled.md` (minor).
* **Decisions taken**:
  * `vault.boxListing` on a deleted vault hands out a fresh listing of the tombstone's life (a
    tombstone has its own `vault_tok`). This is the behaviour from before #691. Storage refuses
    that listing's calls as `absent_vault`.
  * I set aside refusing in the getter: that would add a refusal, which the brief rules out.
    I also set aside handing back the live life's old listing: it is disabled, by `vault_tok`.
  * `putBox` keeps the long-standing `#stampsOf` guard (`demandEnabled().demandPresent()`), so it
    refuses `vault_gone` before reaching storage. The guard predates #691 and is true: sealing
    needs the vault's present stamps. Removing it would give storage's `absent_vault` instead.
    This is an open question.
  * `beginWatch` keeps `demandWatchable`'s `vault_gone` refusal, which predates #691.
* **Deviations**:
  * The `align` condition changed. Under `! this.isPresent`, a listing made for the
    tombstone's life and hello'd would be dropped on the next align with its watch still running.
  * Under the new condition, a listing is dropped only once it belongs to a life the vault no
    longer has, and then it has already been aligned (said goodbye) as a child.
  * The new bank-ending test fails under the old condition.
* **Discoveries**:
  * design-models' `vault.get ifAbsent:nil` row said it returned null. It resolves the Vault,
    absent; I fixed the row on the way.
  * Box verbs under a tombstone refuse with refusalkind `absent_vault` and act `vault_gone`
    (`throwers.ts` maps the act to the kind). Tests assert both.
  * Nothing under `src/storage/` or the adapters was touched (thread 24).
* **For the Coach**: the three open questions in the PR body. putBox's `vault_gone`, beginWatch's
  `vault_gone`, and a by-hand hello on the tombstone listing are each recommended kept or
  accepted.
