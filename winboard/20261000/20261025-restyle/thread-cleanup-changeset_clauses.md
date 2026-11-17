# Thread cleanup: changeset clauses (2026-10-27)

Branch `20261027-changeset_clauses`, cut from `origin/main`. Changeset prose only: no source changed.

* **Built**: `.changeset/20261026-brands.md` (#275) gained two clauses, each checked against the code:
  a passphrase that is not text is refused with `meta.fieldnames` an empty list (`refusalOf` in
  `src/checks/validator.ts` drops a failure at the input as a whole from the list, and
  `passphraseCleartext` in `src/types/type-aliases.ts` fails at the top); and `safebyok/testing`
  exports the type `FakeCiphered` (`tests/test-helpers.ts` line 15, built from `tests/test-helpers/builders.ts`),
  beside `fakeCiphered`, which was already exported.
* **Checked, no change**: `.changeset/20261026-vault_record.md` already says a demand on a thing whose
  `vault_tok` is empty (`demandConsistentWith` or `consistentWith`) now refuses `bad_option` where it
  answered false or refused `vault_remade`, in its *Exports* paragraph under `Stamped`. Nothing added to
  `20261026-cipher_ctx.md`.
* **Strays**: no old-sense "stamp" (the set a thing was made under) is left in `packages/*/src`: no
  `StampedShape`, `checkedStamp` or `Stamped`. Every "stamp" hit is `VaultStamp`, `BoxStamp`,
  `LeaseStamp` or a doc block using the bound-fields sense, or the verb (`vault-record.ts:36`, `vault.ts:586`,
  `proving.ts:53`). One thing to eye: `proving.ts:132-144`, a private `#vaultStamp`, is handed a
  `VaultSparse` (`madeUnder`), which holds the stamp; it is typed `VaultStamp`, so it is right.
  One `VaultScope` type in the core (`src/checks/core-checks.ts:58`; `src/types/types.ts:48-49`
  re-exports it). Convex has its own validator and a type inferred from it
  (`safebyok-convex/src/component/validators.ts:26`, `component/vaults.ts:210`), which is that package's
  validator, not a second core type.
