# Thread 7: epoch_rename (2026-10-15)

Branch `20261015-epoch_rename`, PR [#84](https://github.com/mrflip/safebyok/pull/84), stacked on #77 (the line #71 → #76 → #73 → #78 → #74 → #77 → this). Justify: green (root 123, safebyok 911, convex 275, indexeddb 101, react 71, postgres 134, graphql 142, argon2-wasm 44, demo 124).

* **Built**: `passphrase_epoch` is `unlock_epoch` everywhere it is stored or compared: `VaultBundle` and `DeviceUnlock` (`types.ts`), `BundleExpectation` (`vault-db.ts`), `vault.ts`, `bundleOf` and `describeVaultDB` in `safebyok/testing`; `safebyok-indexeddb` (`expectations.ts`); `safebyok-convex` (validators, component `vaults.ts`); `safebyok-postgres` (`columns.ts`, `vault-tables.ts`, `vault-tables.sql`, the `UPDATE ... WHERE`); `safebyok-graphql` (SDL, `fields.ts`, resolvers, client). Also `passphraseEpoch` → `unlockEpoch` and "passphrase epoch" → "unlock epoch" in VOCABULARY, READMEs, `notes/security.md`, TODO, comments, tests. One changeset, `.changeset/20261015-epoch_rename.md`, five packages minor, naming the stored-shape change and the Postgres `ALTER TABLE`.
* **Decisions taken**:
  - The unreleased `20261015-unlock_envelopes` changeset was edited to the new name too, so the release notes never mention a field that does not exist.
  - Historical records (other threads' `whiteboard/` files, `human/`) are left as written; they describe what was true then.
  - Three comments and one test title saying a vault's "passphrase changed" now say its "unlocks changed" where the epoch is the point (`vault.ts`, convex `vaults.test.ts`). Tests about changing the passphrase itself keep their titles.
  - No test added: the renamed suites already prove the bundle, the expectation and each adapter's compare, and the old field is rejected by the strict schemas (an unknown key is stripped, a missing `unlock_epoch` fails).
* **Discoveries**: the demo names the field nowhere. Strict validation means an old-named record fails as `corrupt_record`, with no code to write.
* **For thread 8**: nothing left to rename; `maxLockboxes` goes in the same adapters as an addition.

* **Review** (`fixed`, then filed): the reviewer made the changeset say what each store shows (Postgres keeps the old column and fails `storage_unavailable`; Convex refuses the new schema over old rows), added two fail-safe tests, and corrected `outrun`'s doc block. At the orchestrator's word, the aligned literals the rename knocked out of line were realigned, and prose saying "a new passphrase" where any change to the unlocks moves the epoch now says so (the `vault_locked` and `stale_write` messages, `unlock()`'s doc, `notes/security.md`).
* **Left, minor** (also in the PR): the Postgres README has no upgrade note for the renamed column; `destroy()` on a corrupt vault; a GraphQL client and server on mismatched versions fail with the new field name unknown.
