# The receive contract: a draft note, 2026-11-10

`notes/receive-contract.md` is a draft for the Coach to mark up, asked for as the answer contract's
counterpart on the receiving side (`deliver`, `fateOver`, `buildOrReceive`, `reconcileCentral`,
`receive`, `adopt`, `align`, `receiveWorld`). It changes no code.

## What it holds

* Tests that make four tags: `held`, `rcvd`, `rev`, `life`.
* Nine invariants, L1 to L9.
* A preflight of seven rows, F1 to F7: disabled, a row not asked for, and four impossible states.
* What each of the classifier's acts carries to a listing.
* Selecting the instance: listed or not, and nothing more.
* The receive table, seven rows, one for a box and a vault alike.
* takeWorld, three rows.
* Nine places the code today differs.

## Checked, and how

* The tables were read off `models/storable.ts`, `models/listing.ts`, `models/vault-listing.ts`,
  `models/vault.ts` and `models/box.ts` at main c84193a6b.
* One claim was run: a `fetchBox` under a vault row of another life answers `vault_mismatch` today.
  The first draft said the caller heard `record_conflict`; that was a misreading, and the note has
  the corrected account (difference 4).
* Nothing else in it was run.

## Open questions

1. F3: a box row under another `vault_tok` in an answer becomes `storage_issue`, where today it
   is `record_conflict`. This follows the ruling that a sound row at the wrong address is a
   `storage_issue`.
2. F4 to F7 as one condition and one sentence, where today there are three throwers.
3. F7 refuses a live row over a tombstone under the same life token. Today a vault is replaced
   there and a box adopts. The less-code choice is to drop F7 and let R7 adopt it.
4. R5 treats a box and a vault differently: a vault gets a new instance, a box keeps its own.
5. W1 and W2 drop a world that is not this vault's life, where `Vault.receiveWorld` today throws.
6. Where the classifier lives: a file of pure functions beside the listing, as
   `storage/classifier.ts` is beside the vaultDB, is the agent's lean.
7. The name `takeWorld`: the code says `receiveWorld`.
