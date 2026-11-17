# Thread 8: vault_slot (2026-11-03)

Branch `20261103-vault_slot`, PR #456, stacked on #455. Justify: **green**. Root scripts 302; safebyok 4631 | 37 skipped; indexeddb 167 | 11; postgres 322 | 15; fastkey 49; react 326; demo-react 230 | 17; convex 375 | 9; graphql 345 | 15; e2e 107 | 116 skipped. Size budgets unmoved. No `eslint-disable`, no `ts-expect-error`.

* **Built**:
  * `listing.ts`: `fateOver(held, record)`, default `'receive'`, and `#buildOrReceive` acting on `'receive' | 'lose' | 'replace'`. A replacement is made and takes the record before it takes the slot, so the slot is never empty; then the old one is vacated. `#deliver`'s absence is now "nothing present once delivered", so an older record that lost still reads as gone. `putDraft(draft, ante, opts)`. `del` over a `damaged_records` entry goes over the entry's own revision.
  * `vault-listing.ts`: `fateOver` (older loses; newer of another `vault_tok`, or alive over a tombstone, replaces; else `receive`); `ensureVault(record, prior)`, `tryEnsureVault`; `create` over a tombstone; `absentRefusal`.
  * `vault.ts`: `adopt` override, the end state: a tombstone taken in locks, erases the row, vacates the box listing, the vault staying in its slot. A refused erase there is bad news, not a panic. `vault.del()` lands on it with no code of its own. `#dropLease`; `#vacateLease` drops the lease first and turns a synchronous throw from the duck into a refusal. `boxListing` refuses `vault_gone` on a vault gone.
  * `vault-db-shapes.ts`, `memory-vault-db.ts`: `isDamagedVaultAt`, `isDamagedBoxAt`; `doDelVault`, `doDelBox` land on a row failing its checks when `prior` names it as `damaged_records` lists it.
  * **Removed**: the `ouch` row family of `reconcileCentral`, `'ouch'` from `recordShapeVals`, `'ouch'` and `'skip'` from `centralPolicyVals`, `tombstoneFor`'s `am`, and the tests of them. `'d'` stays in `amVals`: a `damaged_records` entry is a tombstone in the one shape. Stale docs on `Tombstone`, `Storable.receive`, `Listing.fetch`, `Box.send` and their neighbours.
* **Decisions taken**:
  * **`vault_gone` for a vault gone**, one change in `absentRefusal`: it is the spec's word and the vaultDB's. `absent_vault` means nothing is held under that label.
  * **Damaged rows, by the ruling.** `listing.fetch` over one keeps refusing `damaged_record`, the one check that finds it, and holds what it held. Nothing is delivered and no instance is touched. Deleting takes the entry itself: `listing.del(entry)` puts the tombstone over the entry's revision, sentinels included. A prior that does not match still refuses as a get does, and `put` is untouched, so a birth cannot write over one.
  * **A newer tombstone over a tombstone of the same life is received**, not replaced, so a repeated delete keeps the instance. Only a live record replaces a tombstone.
  * **`create` keeps its default `ifPresent`** (`stale_write`), so `bank.ensureVault`'s stale path stands. Thread 10's `build_vault` calls `ensureVault`, whose `{ ifPresent: 'get' }` gives `landed` and `another won`.
  * Set aside: `fateOver` as a table in `#deliver` (it needs the instance held, and only the vault listing has rows); dropping a held instance when `fetch` refuses `damaged_record` (the refusal cannot tell a box row from its vault row, and thread 9's list drop is the place); a new verb for damaged deletes (`del` already takes a sparse duck, and an entry is one).
* **Deviations**:
  * **`getVault`'s `boxes` and `damaged_records` stay out of `tryGetRow`.** The handoff said to pick them up if `build` is where they land. The spec lands them in `vault.hello` and `boxListing.hello`, thread 9. So nothing yet hands a host a `damaged_records` to name: tests make the entry with `VS.damagedVaultOf` and `VS.damagedBoxOf`.
  * **Spec disagreements settled.** `getBank`'s "a tombstone: old vault vacated and unlisted; build(tombstone)" against `#deliver`'s "tombstone over live: vault stays in its slot": the latter, per the handoff; same-life only, as a tombstone of another `vault_tok` replaces. gating.md's "a vault too damaged to prove is deleted by hand" and "a damaged box blocks its boxlabel": superseded by the ruling, though a birth still cannot write over a damaged row until it is named.
  * `vaultListing.del` stays `del(duck)`, not the spec's `del(scope, vault_tok)`: thread 11's.
* **Discoveries**:
  * Crossing: a `del(entry)` of rubble while an instance is held under that scope lands, then its answer's seq can meet the held revision under another tok and throw `record_conflict`, so the row is gone and the caller hears a throw. No machinery added; thread 9's list drop removes the held instance first.
  * Crossing: a store wiped under a held tombstone makes `create` go over a revision no longer stored: `stale_write`, until a fresh listing.
  * Crossing: nothing stored (`void`) answering a fetch over a live vault still throws `record_conflict`, per `reconcileCentral`; it does not rebuild.
  * Crossing: a late `getVault` answer older than a tombstone now loses before `receive`, so it notes no success; this is the row's aim.
  * Built from a tombstone, a vault erases any row cached for that `vault_tok`. One path, and wanted.
  * `OtherVaultTok`'s phrase ("does not yet remake") still reads true for a box; left.
* **For the Coach**:
  * **A refused erase at a remote delete is bad news, not a panic**, per the spec's "the tombstone stands". The row stands until a later erase; a new life's `vault_tok` reads it as none. Security entry written.
