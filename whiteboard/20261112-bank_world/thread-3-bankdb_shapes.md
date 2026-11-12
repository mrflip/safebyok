# Thread 3: bankdb_shapes (2026-11-12)

Branch `20261112-bankdb_shapes`, PR #660, stacked on #658. Justify: green, all packages (safebyok 3129, convex 318, postgres 237, graphql 376, react 259, indexeddb 180, fastkey 43, root scripts 278, demo 97, e2e 504).

* **Built**: the bankDB's contract shapes and classifier in the core, unexported; only tests call them.
  * `src/shapes/shapes-bankdb.ts` (BX, new): `BankFormat` 3001, `GateFormat` 4001, `VaultFormat` 6003. Rows `bankRecord`/`bankTombstone`/`bankRow`; `passphraseWayin`, `passkeyWayin`, `wayins` (`main` plus optional `passkey0`, each wayin's `wayinlabel` its ckey), `gateRecord` (`gatelabel: 'main'`, `bank_tok`, `gate_tok`, `wayins`, empty `auth`/`sigs`/`meta`; live only, no tombstone); `vaultRecord`/`vaultTombstone`/`vaultRow` (`bank_tok` and `vault_tok`, no gate). `storedBankRow`/`storedGateRow`/`storedVaultRow` refuse `damaged_row`. Shells `shellBankOf`, `shellVaultOf`. Asks: `bankEnsure` (`gates: ['main']`), `bankBuild` (record + gate, over expected), `gatePut` (with `gateVerb`), `bankDel`, `vaultGet`/`vaultPut`/`vaultDel`/`vaultAsk` (each with `bank_tok`). Box asks are SX's, reused. `loggableAsk`.
  * `src/shapes/shapes-core.ts`: `bank_tok`, `gate_tok`, `gateScope`/`GateScope`. `shapes-enums.ts`: `bankAskOpVals` (adds `ensure`, `build`), `parentBankActVals` (`bank_void`, `bank_gone`, `bank_reborn`), `bankBadActVals`.
  * `src/storage/bank-db.ts` (edited from the verbatim copy of `vault-db.ts`): answer types with `parent` in place of `world`, one per verb (`EnsureBankAnswer` ... `TidyGoneAnswer`), `BankEnsured`, and the helpers `answerWithVal`, `refusedAnswerOf`, `badAnswerOf`. No `BankDB` interface: thread 4 writes it.
  * `src/storage/bank-classifier.ts` (edited from the verbatim copy of `classifier.ts`): one entry point per family, each taking the ask and what storage fetched: `classifyEnsureBank`, `classifyBuildBank`, `classifyStoredGate`, `classifyDelBank`, `classifyStoredVault`, `classifyStoredBox`, `classifyStoredBoxes`, with `*Fetched`/`*Stored` types. *The row above* (`parentBankActOf`); *The gate verbs' policy* (`GateActOfForVerb`, `satisfies Record<GateVerb, ...>`); `buildBank`'s two rows (`BuildPolicies` add/get); `delBank`'s cascade (the del table; on `deleted` the adapter deletes the gate and vault rows).
  * Refusals: `RefusalRows.parent`; throwers `bankGateIssue`, `mainGateMissing`; phrases `BankTokNotNew`, `GateOfOtherBank`, `GateNotBorn`, `MainGateMissing`.
  * `notes/answer-contract.md` *The bankDB*: *The row above* (P1-P4), *Bank ops* (BE1-BE4, BB1, BD1), *Gate ops* (GV1-GV6). VOCABULARY: bankTok, gateTok, bank row, gate row, gatelabel, wayinlabel, parent, buildBank/delBank, bank_void/bank_gone/bank_reborn.
  * Tests: `tests/test-helpers/bankdb-world.ts`, `tests/shapes/shapes-bankdb.test.ts` (56), `tests/storage/bank-classifier.test.ts` (34), `tests/storage/bank-db.test.ts` (3), row-format snapshots `bankRow-fmt3001`, `gateRow-fmt4001`, `vaultRow-fmt6003` (hidden from rg under `tests/.snapshots`), BX in `validator.test.ts`'s sweep.
* **Decisions taken**:
  * A gate row or vault row whose `bank_tok` is not the live bank's counts as no row (`gateRowOf`/`vaultRowOf` give null): a row of an ended life is invisible, as design.md's *The row above* reads. A live bank with no `main` gate throws `damaged_row` (`mainGateMissing`), from `ensureBank`, `buildBank`'s get and the gate verbs alike.
  * Gate verbs are puts with `{ ifAbsent: 'fail', ifPresent: 'repl' }`; on `replaced` the verb's policy runs: `registered_at` moved is `gate_issue`; `addPasskey` over a stored `passkey0` is `camped`; `revokePasskey` over none is `passed`; any other wayin changed (`isEqual` over `omit`) is `gate_issue`. Answers keep the classifier's `replaced`; mapping it to `added`/`revoked` is thread 4's adapter.
  * `buildBank`'s policy cells (new `bank_tok`, gate under it, gate born at seq 0) are held by `BX.bankBuild`'s refines as `bad_record`, not `gate_issue`, under rule 17 (no extra code).
  * A separate `bankBadActVals` rather than widening `badActVals`: the vaultDB's acts stay as they are until thread 16.
  * Asks strip unknown fields, as SX's do; rows are strict.
  * The phrase names above, and the `*Fetched`/`*Stored`/`classify*` names, are mine (rule 13).
* **Deviations**:
  * Rule 10: the classifier and `bank-db.ts` were copied verbatim first (d6f2c3db7). `shapes-bankdb.ts` was composed fresh from SX's parts (its field checkers, revision and tombstone fields): SX is mostly VaultDB's world/box shapes, and a copy would have been almost all deletion.
  * The changeset is empty frontmatter with a body line ("Nothing a host sees yet ... Stored format: unchanged"), because nothing is exported or written yet.
* **Discoveries**:
  * A put over no row citing a seq classifies `ahead`, not `void`: a gate verb under a live bank with no gate row of its `bank_tok` refuses `ahead`, while `ensureBank`/`buildBank` throw `damaged_row` for the same row.
  * A refusal's rows are read with `rowsOfRefusal(err)`, never `err.meta.rows` (a non-enumerable symbol).
  * `tests/helpers/validator.test.ts` sweeps every shapes module by name: a new shapes module must join `ShapeModules`.
  * Name collisions to settle at export: `BX.VaultRecord` vs `SX.VaultRecord`, `classifyStoredVault` in both classifiers. A namespace export for BX in thread 4 would avoid them.
* **For the Coach**: the open matters, each with my recommendation:
  * **Box ops skip the bank**: box verbs see the vault row only, so a vault row of an ended bank life is not noticed by them. Carry as today (rule 2); thread 4's adapter fetches the parent vault under the bank anyway.
  * **Foreign gate row, two answers**: gate verbs refuse `ahead`, ensure/build throw `damaged_row`. Keep (rule 17).
  * **No `damaged_bank`**: a damaged bank parent refuses `damaged_row`. Keep.
  * **`tidyGone`'s parent** is typed `BankScope`; design.md's parent cell for it reads oddly. Confirm.
  * **`RefusalMeta.act`** is not widened to `ParentBankAct`; thread 4 may need it.
  * **Duplicated tables** in `bank-classifier.ts` and `classifier.ts` until thread 16.
  * **Snapshot name** `gateRow-fmt4001` while the shape is `gateRecord` (there is no gate tombstone). Keep, for the row-format family's naming.
