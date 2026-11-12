# vaultdb_asks: the vaultDB buttonup, then the deliver/receive rat king

Worktree `/workspace/byok-vaultdb_asks`, branch `20261111-vaultdb_asks`, cut from `20261111-names_ruled` (efe628691).

## Part 1: the vaultDB buttonup

### The ask, the length of the call stack

| # | Where | Shape | Validator | Strict? | Shares a validator with |
|---|---|---|---|---|---|
| A1 | host -> listing (`put(record, opts)`, `get(scoped, opts)`, `del(sparse)`) | a record or scope, plus opts (`PutOpts`, `FetchOpts`) | `putOpts`, `fetchOpts`, `recordOf`, `scopeOf` | generous: defaults (`ifAbsent: 'add'`, `ifPresent: 'repl'`), extras stripped | none: not an ask, and stays so |
| A2 | listing -> vaultDB verb | `VaultGetAsk` ... `BoxDelAsk`; `VaultListAsk` `{ op: 'list', applabel, user_id }`; `BoxListAsk` `{ op: 'list', ...vaultScope, vault_tok }`; `BoxTidyAsk` `{ op: 'tidy_gone', applabel, user_id }` | `vaultGet` ... `boxDel`, `vaultList`, `boxList`, `boxTidy` | strict, no defaults, refinements across fields | A3, A4 (same object, parsed once) |
| A3 | vaultDB -> adapter `do*` | the ask as A2 parsed it | none (trusted past the entrypoint) | | A2 |
| A4 | adapter -> classifier | the same ask; the tables read slices of it (`ifAbsent`, `ifPresent`, `expected`, `record`'s revision) | none | | A2 |
| A5 | Convex mutation or query, server side | the ask, re-parsed (anyone signed in can call it) | `vaultPut` etc. again | strict | A2 |
| A6 | answer's `ask`, a refusal's `meta.ask` | `LoggableAsk`: every field optional, a record cut to its meta | `loggableAsk` | generous: partial, strips the payload | none: A2 must refuse what this keeps |
| A7 | an answer on the wire (GraphQL) | `CrossedAsk`: A6 with null for each absent field | `crossedAsk` | strict, nulls | none: nulls where A6 has absence |
| A8 | GraphQL inputs | `SafebyokVaultGetAskInput` etc.; lists and `tidyGone` keep their separate arguments | the schema, then A2 in the vaultDB | schema-strict | A2, behind the schema |
| A9 | models' pins (`Storable.del`, `Listing.#deliveryPlanOf`) | address plus revision of a record or scope | `revisionPins` | stripping | none: not an ask |

Gone: `ReqParams`, `reqParams`, `requestParams`, `reqParamsOf`, `CrossedReqParams`, `crossedReqParams`, the answer's
`req_params` (now `ask`), the classifier's `Asked` family and `RowAt`, `VaultQuery` and `BankScope` as a list or tidy verb's argument,
a refusal's `meta.call` (now `meta.oplabel`).

### Rulings (2026-11-11)

* `op: 'list'` on the list asks; four `classifyStored*` names; Convex queries take `{ ask }`; GraphQL lists keep separate arguments: as built.
* `tidyGone` takes `{ op: 'tidy_gone', applabel, user_id }`.
* `call` is `oplabel`, in refusal meta, on the wire, and in the logger's story.
* `RowAt` is gone: the tables take the stored row, null for none, and read presence from it.
* `notes/design-vaultdb.md` describes the vaultDB as it stands.

### Departures, as built

* No `VaultsFetched`: `classifyStoredVaults(ask, vaults)` takes the bare `RowOfVault[]`.
* `vaultAnswerOf`, `boxAnswerOf` and `answerOf(thunk)` are gone: each verb builds its answer inline.
* `GraphQLVaultDB`: each verb is the same blunt try/catch, its refusals made by `answerForRefusal`.
* Convex `getBox` / `listBoxes` return `world`; Postgres's `ListBoxesWithVaultSql` aliases its vault column `world`.

## Part 2: deliver / receive / receiveWorld / fate (draft, uncommitted, justify green)

The branching of `deliver` is made in two sync planners, and carried out by one router:

| step | where | decides from |
|---|---|---|
| 1. the world | `deliver`: `this.world.receiveWorld(answer.world)` | the answer's `world`; may vacate this listing |
| 2. which row | `#deliveryPlanOf`, by `RowOfAct` | the act alone: `stored` (val, pinned to the record sent), `found` (val, pinned to the scope), `dbhas` (pinned to the scope), `nothing_stored`, or none |
| 3. which instance | `#rowPlanOf`, then `slotStepOf` (the vault listing's override) | what is listed at the row's scope |
| 4. do it | `#carryOut(plan)` | `SlotPlan.step`: `none`, `absent`, `make`, `keep`, `receive`, `remake` |
| 5. receive | `Storable.receive` -> `reconcileCentral` -> `adopt` / `align` | unchanged: the thing's own receive table |

* `fateOver` / `SlotFate` ('receive' | 'lose' | 'replace') became `slotStepOf` / `SlotStep` ('receive' | 'keep' | 'remake').
* `#deliverGood`, `#receiveNothing`, `#demandRecordOfScope` went into the planner and the router.
* `deliver` is synchronous: nothing in it awaits, and a refusal's row is received before `panicIfRevoked`, as before.
* Gate verbs are put-shaped and linear. `#gateVerbAnswered(ante, moved, call, { isScopePinned })` became `#gateMoveOf(ante, moved)`,
  a sync maker of the record and its prior. `isScopePinned` went with an act split: `revokePasskey` over a vault with no
  passkey answers `passed` (it was relabeled `revoked`), so the act table pins it to the scope.
* Test fixtures: a scripted put or del answer carries a write act, and `staleWriteOf` the act `stale`, as the vaultDB sends.

Open: step 5 still decides inside `Storable` (receive table R1-R7, `notes/receive-contract.md`). Folding its verdict
into the plan (`SlotPlan` carrying `older | same | fill | adopt | gone`) is the next cut.
