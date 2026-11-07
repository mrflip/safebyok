# Thread 3: storage_door (2026-11-07)

Branch `20261107-storage_door`, PR #568, stacked on #567 (thread 1, `20261107-devicedb_verbs`). Justify green: core 2,307, indexeddb 107, postgres 123, convex 227, fastkey 49, graphql 210, e2e 200; size 7.08 kB of 10.
Carried from sprint vaultdb_cleanup, where it was thread 7; the plan's section 7 is the authority.

* **Built**, by the plan's twelve items:
  1. **`DB` alias.** Every `import * as SX from 'safebyok/storage'` in the adapters (convex, postgres, graphql, indexeddb)
     and in `e2e/` is now `import * as DB`. The core's tests import no `safebyok/storage` star (they reach `src/` by
     relative path), and thread 1's deviceDB battery imports none either, so the core and the battery had nothing to
     rename. `SX` stays what STYLE.md says: `src/shapes/shapes-storage.ts`, inside the core. STYLE.md's import-alias table
     gains a `DB` row.
  2. STYLE.md *Validation* says the storage validators are exported from `safebyok/storage` and star-imported as `DB`.
  3. **Phrases.** IndexedDB's five trouble sentences moved from `shelf.ts` to `helpers/phrases.ts`, section
     *Refusals: storage backends*, and are exported from `safebyok/storage` in a new *The phrases* section: `NoBrowserStore`,
     `TransactionAborted`, `DatabaseClosed`, `StorageWithheld`, `BrowserStoreFailed`. Texts are unchanged (tests match them by
     regex). Names carry no "IndexedDB" (thread 2's `troubleOf`, in the core, will speak them). GraphQL's
     "answered without what was asked" sentence moved too, as `SchemaNotServed`. Convex and Postgres write no sentence of
     their own that a refusal carries (Convex's `phrases.ts` holds only input-check sentences, which stay).
  4. Shared banks / `mayReach`: no mention is left anywhere `rg -uu` reaches outside `whiteboard/`, `winboard/` and
     `human/`. Nothing to strike.
  5-6. `notes/wontfix.md`: Convex field names, the GraphQL stream's best-effort stop, and the Convex tombstone-full vault.
     The Convex README says, in bold, that once deleted boxes fill a vault's cap it refuses new box labels until the vault is deleted.
  7. `vaultChannelOf(user_id)` checks its user_id (`bad_option`) at the export; the internal callers use a private
     `channelOf`, which trusts them. A test covers empty, a space, a slash, dots alone, non-ASCII and a non-string.
  8. **Best-effort cap**, in the Gallant `maxBoxes` words, in: the Postgres, Convex, GraphQL and IndexedDB READMEs,
     `memory-vault-db.ts`, `postgres-vault-db.ts`, `shapes-storage.ts`'s `maxBoxes` option, `refusals/errors.ts`'s `vault_full` row
     and Convex's `maxBoxes` option doc. The Postgres README and the comment above `lockedVaultRowOf` now give the
     compare-and-set as the lock's reason, not an exact cap.
  9. CLAUDE.md: "A lock where none was needed before is a last resort too."
  10. **Salt caps**: `MaxSaltBytes` 65,536 to 32; `salt_b64` is checked as base64url text of at most 32 bytes
      (new phrase `passphraseSaltShape`). fastkey's two cases and its "largest of each bound" case follow to 32 and 33;
      two cases in `wayin.test.ts` cover a 33-byte and an undecodable stored salt.
  11. The Postgres README already says the host owns the roles, row-level security and who may LISTEN; no edit.
  12. `e2e/package.json` drops `safebyok-old` (nothing in e2e imports it); the lockfile follows. PROCESS.md's *Packages* paragraph now
      says the storage adapters and fastkey peer on `safebyok`; safebyok-react and safebyok-idb-old still peer on `safebyok-old`.
* **Decisions taken**:
  * GraphQL's `NotSignedInAs` sentence is gone: the resolvers throw the core's `identityRevoked()`, whose sentence says the same
    in the vault's voice. (Reuse before a new phrase, per throwers.ts's header.) No test matched the old words.
  * An undecodable `salt_b64` is refused along with a long one. The alternative, refusing only a decodable salt over 32 bytes,
    would let a salt of any length through as long as it was not base64, and decoding at use would fail instead.
  * Convex's `maxBoxes` is transactional in fact; its README still says best effort, as the Coach asked, and keeps the
    component's own 8,000-row limit as the hard one.
  * Set aside for the vault-row padding in Convex's whole-document test: padding `salt_b64` (now capped); `key_deriver_label`, plain
    text with no cap, took its place.
* **Deviations**: item 4 and item 11 needed no edit (above). GraphQL's `graphql-vault-db.ts` states no exact cap at any line;
  the README sentence is where it says best effort.
* **Discoveries**: the guarantees file (`notes/guarantees.md`) says nothing against a tighter salt cap: its Argon2id line
  already names a 16-byte salt.
* **For the Coach**: the salt check also changes the stored shape: a vault with a passphrase salt over 32 bytes (none is
  made by the package) reads as damaged. The changeset says so.
