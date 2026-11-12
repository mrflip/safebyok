# Thread 4: bankdb_adapter (2026-11-12)

Branch `20261112-bankdb_adapter`, PR #TBD, stacked on #660. Justify: green, all packages (safebyok 3189, convex 318, postgres 237, graphql 376, react 259, indexeddb 180, fastkey 43, root scripts 278, demo 97, e2e 504).

* **Built**: the bankDB's interface, adapter base, memory adapter, wire checks and exports. Nothing calls them yet; the vaultDB family stays exported (rule 11).
  * `src/storage/bank-db.ts`: the `BankDB` interface, each verb with its `try*` form; `BankDBVerbnames` (29 names); `GateAnswer`, `DelBankAnswer`, `BoxesListed`, `Notice`; re-exports `Tidied`. Brands `IsBankDB`, `IsAdapterBankDB` with `isBankDB`, `isAdapterBankDB` in `helpers/consts.ts`.
  * `src/storage/adapter-bank-db.ts` (edited from the verbatim copy of `adapter-vault-db.ts`, commit 2949fa56f): `AdapterBankDB`. Each verb parses its ask, makes one `do*` call that fetches, judges and stores the whole verb in one atomic unit, and answers. The `classify*` calls are protected methods, so a store that judges in-database (a Postgres function, a Convex mutation) overrides them. The do* list: `doEnsureBank`, `doBuildBank`, `doPutGate` (one for all three gate verbs, named by `ask.gateVerb`), `doDelBank` (cascades gate, vault and box rows), `doGetVault`, `doPutVault`, `doDelVault` (clears that life's boxes), `doListBoxes`, `doGetBox`, `doPutBox`, `doDelBox`, `doTidyGone`, `doWatch` (a no-op by default). `Heard` is `{ row, parent? }`.
  * `src/storage/memory-bank-db.ts` (edited from the copy of `memory-vault-db.ts`): `MemoryBankDB`, a shelf per bank (bank row, gate rows, vault rows) and box rows keyed by vault scope and vault life. Cheats `_cheat_shelfOf`, `_cheat_boxRowsOf`.
  * `src/shapes/shapes-bank-answers.ts` (WX, edited from the copy of `shapes-answers.ts`): one wire check per verb's answer, and `crossedNotice`; `crossedAsk`, `damagedBox`. Reuses `AX.crossedErr`, `AX.damagedVault`.
  * `src/shapes/shapes-bankdb.ts`: the bankDB's own box rows, `BoxFormat` 5003 with `bank_tok` (`boxRecord`, `boxTombstone`, `boxRow`, `storedBoxRow`, `shellBoxOf`, `damagedBoxOf`), box asks with `bank_tok`, `vaultLifeOf`, `adapterBankDBOpts`, `memoryBankDBOpts`, `noticedRow`, `noticedParent`.
  * `src/storage/bankdb.ts`: barrel, exported as `BX` from `safebyok/storage`, with `AdapterBankDB`, `MemoryBankDB`, `BankDB`, `BankDBVerbnames`, the brands, `BankBadAct` and `ParentBankAct`.
  * `notes/answer-contract.md` *The bankDB*: the box row's life pair; *The bank adapter*, the do* table. VOCABULARY: bankTok (box rows too), bankDB.
  * Tests: `tests/storage/memory-bank-db.test.ts` (20), `tests/shapes/shapes-bank-answers.test.ts` (5), the box section of `bank-classifier.test.ts`, row-format snapshot `boxRow-fmt5003`, WX in `validator.test.ts`'s sweep. The battery is thread 4b's.
* **Decisions taken**:
  * **Box rows carry `bank_tok`** (the Coach's ruling, sent mid-build): the box row's life is `BX.vaultLifeOf({ bank_tok, vault_tok })`, `${bank_tok}/${vault_tok}`. The classifier's `boxRowOf` gives null for a box row whose pair is not the vault row's, `classifyStoredBoxes` skips one, and a box ask citing another pair than the vault row's is `vault_reborn`. One helper, no new state. This closes thread 3's "box verbs see only the vault row".
  * Refusal kinds for the row above: `bank_void` and `bank_gone` refuse `absent_vault`, `bank_reborn` refuses `vault_reborn` (rule 17: the kinds a host already switches on for a vault, no new code).
  * Gate verbs answer the classifier's `replaced` or `passed` on the wire; I did not map them to `added`/`revoked` (thread 3 left that to me): a host needs no new switch for it.
  * `buildBank`'s refused `dbhas` is the bank row; a gate verb's is the gate row; `delBank`'s parent is null.
  * `tidyGone` counts the box rows left, as today's code does; design.md says "rows deleted".
  * A watch notice whose row fails `BX.noticedRow` is dropped, as today.
* **Deviations**:
  * `vault-db.ts`'s `BadAnswer.act`, `RefusalMeta.act` and graphql's `CrossingAnswer.act` widen to `BankBadAct`; `listing.ts`'s delivery table and `RefusalkindForBoxAct` gain the `bank_*` acts; `isWriteAct` takes `ParentBankAct`. One shared refusal path; the alternative, a cast in vault-db's `badAnswerOf`, was a safety hatch for a case that cannot occur.
  * `Heard` is `{ row, parent }` where it was a row alone, so a box notice carries its vault row.
  * Two `!` in `adapter-bank-db.ts` (`stored.gate!` on a good buildBank and gate verb: the classifier sets it on every ok act), and two `eslint-disable-line unicorn/prefer-private-class-fields` on the memory cheats, as on `MemoryVaultDB`'s.
* **Discoveries**:
  * src lines vs c83af8fdb: +1087 / -57 over 15 files; vs the verbatim copies (2949fa56f): +752 / -402.
  * life_tok: the virtual pair needed one helper and a string compare; nothing strained. A real `life_tok` column would replace `vaultLifeOf` and the two-field box key; the in-memory key is the joined string already.
