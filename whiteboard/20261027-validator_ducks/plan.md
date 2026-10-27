# Thread `validator_ducks`: plan

* **Date:** 2026-10-27. **Branch:** `20261027-validator_ducks`, cut from #297's tip (`1b2dd9ce`).
  Its PR says "Stacked on #297".
* **Sources:** the Coach's request in chat (below), and three surveys beside this file:
  `survey-validators.md` (inventory, grouping, naming), `survey-signatures.md` (signatures,
  ducks, zod's reading of class instances), `survey-catches.md` (catch sites and call chains).
* **Collides with:** the fixup sprint's thread 2, `vault_params`, building now on the same base. It
  rewrites `vault.ts`'s box path (`#readBox`, `#boxUnder`, `#storedBase`,
  `#updateBoxListingOf`), the lease take-up and lease-in-force checks, `#damagedBase`,
  `proving.ts`'s `#unwrap`, `gating.ts`'s `#gatedOf` and `bank.ts`'s `vaultPartsOf`. **This thread
  leaves those members alone** (survey-signatures C8, C10, C11, C12; survey-catches item 5) and
  touches only their imports, so the restack meets import lines, not logic.

The request, in short: gather validators and their types into files of about 600 lines at most,
grouped by who imports them, with `// ==` chapters, every type `Z.infer` of its validator, similar
shapes sharing code, common names. Build duck validators: a caller passes whatever is handy (a
Vault object, a field superset of the scope); the duck refuses a field with no right to be there,
refuses a malformed known field whether it is needed or not, and hands back the scope's fields
alone. Preconditions become one-line parses; signatures converge where they can without a change
of behaviour. Catches that a caller further up handles as well go.

## Ground rules

* **No contract change without a ruling.** An exported name keeps its name; a public validator
  keeps its strictness (`vaultScope`, `bankScope` and `bankBag` strip; `vaultBag` strict). Each
  question that would change one is listed under *Open questions* and left as it is.
* **More refusals are fine; contraptions to fine-grain them are not.** A duck may refuse
  something a hand check let through; say so in the changeset where a host could see it.
* **A check stays where there is a question** (the Coach, 2026-10-27).
* **The importer sets decide the files.** `safebyok/idb`, `safebyok/browser` and `safebyok/utils`
  must not grow; `pnpm size` judges, and a budget that shrinks is lowered by the rule.

## Steps (one commit each, `pnpm justify` green at each)

1. **Move.** `src/shapes/` takes the shape validators and their types, by the grouping in
   survey-validators §4: `scopes.ts`, `fields.ts`, `device.ts`, `box.ts`, `vault.ts`,
   `vault-db.ts`, `bank-opts.ts`. `vault-record.ts` and `types/types.ts` empty out and go;
   `type-aliases.ts` keeps what has no validator. Every exported name stays, re-exported
   from where `index.ts` and `validators.ts` reach it. Imports in `src/`, `tests/` and the other
   packages follow. No logic changes.
2. **Drift.** Each type a validator already checks becomes `Z.infer` of it, where its doc block
   loses nothing a host reads in its editor: `PasskeyAnswer`, `BoxBase`, `SealedUnder`,
   `BoxCiphered`, `PassphraseVerdict`, `VaultDraft`. The lease format is written once;
   `device_id`, `key_deriver_label` and `credential_id` become field validators; the wayin header
   is one shape; `VaultBag`, `BankBag` and the box listing are named types.
3. **Ducks.** `shapes/ducks.ts`: `bankScopeDuck`, `vaultScopeDuck`, `boxscopeDuck`,
   `vaultStampDuck` (and its bound variant), `leaseStampDuck`, each made by one helper from the
   kin fields: every field a vault's kin carries, each with the one schema its owners agree on.
   A duck tolerates only what its callers hand it (survey-signatures §3). The stamp duck refuses
   box and wayin fields, whose `registered_at` is not the vault's. Tests pin the contract.
4. **Call sites.** Hand-picked scopes and stamps become one-line duck parses
   (survey-signatures C2 to C4, the `CX.vaultScope.parse` sites inside the package). The
   type-only narrowings: C7, C13, C15, C16, C18, C19, C20. The duplicated `isFunction`
   becomes one kit maker, `fn`. `vault.ts`'s hand-rolled passphrase check uses
   `passphraseCleartext`.
5. **Catches.** survey-catches items 1 (`corrupt_record` for missing meta), 2a (`#writeOver`'s
   `invalid_box` branch), 3 (`checkOutgoing`'s re-throw) and 4 (`bank.#badOutcome`).

## Built (2026-10-27)

* `eb806283` step 1, `2e197056` step 2, `3f222d28` step 3, `38051283` step 4, `fbe2a901` step 5.
* **Departures from the steps above.**
  - `deviceRecordOf` keeps the strip `vaultScope`. A duck there pulls the box and vault shapes
    into the `idb` entry (+2.1 kB), and every caller hands it a parsed scope or a device record.
  - `Scopepath.*` and the public validators keep their strip parse (contract, and the `idb` entry).
  - Catches item 1 stays. Without the `corrupt_record` branch, a `stale_write` naming nothing
    reads as "nothing stands", and the vault reports the vault gone and lets the Vault object go:
    a misreport, not a coarser kind.
  - Catches item 3 stays. `checkOutgoing`'s "Nothing was written" lead was added on purpose in
    #175, `safebyok-graphql`'s client check matches it, and each call site is already one line.
  - Item 5 of the catches survey (`Lease.make` as control flow) belongs to `vault_params`.

## Open questions (for the PR)

* `Kit.fn` costs `idb` 43 B and `utils` 56 B (any kit entry rides in every bundle with a
  validator), and both `fn` and `duck` are public, since `Kit` is exported.
* `VaultBag`, `BankBag` and `BoxListing` appear in public signatures but are not exported.
  `BoxListing` and `VaultOfBox` (`box.ts`) are first-guess names.
* `passkeyAnswerShape` checks `prfBytes` by `instanceof Uint8Array`, refusing bytes from another
  realm; `lease.ts`'s `checkedBytes` judges by tag.

* The scope validators' case (`vaultScope` and `VaultScope`, one validator under two names).
* `vaultBag` taking a Vault object, a snapshot or a BankVault: the duck contract says yes,
  and #293 just made it strict.
* Retiring `invalid_box` for `bad_record` (survey-catches item 2).
* `VaultMadeUnder` checking labels and whole epochs; `VaultDraft` requiring `vault_epoch: 0`;
  `vaultDBShape` requiring `delDamagedVault` and `getCapacity`.
* A per-schema sentence in `Validator`, which would fold the ~30 safeParse-then-throw sites.
* `Box.seal` and `putBox`, each checked by a cascade of validators with two kinds.
* The host interfaces (`MakeBankOpts`, `VaultLogger`, `KeyDeriver`, `Clock`, `StrengthChecker`)
  as `Z.infer`, at the cost of per-member docs in a host's editor.
