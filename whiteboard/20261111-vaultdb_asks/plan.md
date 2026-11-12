# vaultdb_asks: the vaultDB buttonup, then the deliver/receive rat king

Worktree `/workspace/byok-vaultdb_asks`, branch `20261111-vaultdb_asks`, on `main`.

## Status

* Part 1, the vaultDB buttonup: built and committed, with the Coach's rulings of 2026-11-11.
* Part 2, delivery by a plan: the first cut is built and committed; the second cut waits on the Coach.

## Part 1: the vaultDB buttonup

Every verb has `put`'s shape: the try form parses its ask, calls `do*`, and builds its answer inline from what the
classifier returned; its `catch` makes the refusal (`answerForRefusal`). An adapter hands up `VaultStored`, `BoxStored`,
`VaultsStored` or `BoxesStored`, made by the four `classifyStored*` functions.

### The ask, the length of the call stack

| # | Where | Shape | Validator | Strict? | Shares a validator with |
|---|---|---|---|---|---|
| A1 | host -> listing (`put(record, opts)`, `get(scoped, opts)`, `del(sparse)`) | a record or scope, plus opts | `putOpts`, `fetchOpts`, `recordOf`, `scopeOf` | generous: defaults, extras stripped | none: not an ask |
| A2 | listing -> vaultDB verb | `VaultGetAsk` ... `BoxDelAsk`, `VaultListAsk`, `BoxListAsk`, `BoxTidyAsk`, tagged by `op` | `vaultGet` ... `boxDel`, `vaultList`, `boxList`, `boxTidy` | strict, no defaults | A3, A4, A5 |
| A3 | vaultDB -> adapter `do*` | the ask as A2 parsed it | none, trusted | | A2 |
| A4 | adapter -> classifier | the same ask | none | | A2 |
| A5 | Convex function, server side | the ask, parsed again: anyone signed in can call it | as A2 | strict | A2 |
| A6 | an answer's `ask`, a refusal's `meta.ask` | `LoggableAsk`: every field optional, a record cut to its meta | `loggableAsk` | generous, strips the payload | none: A2 refuses what A6 keeps |
| A7 | an answer on the GraphQL wire | `CrossedAsk`: A6, null for each absent field | `crossedAsk` | strict, nulls | none |
| A8 | GraphQL inputs | `SafebyokVaultGetAskInput` etc.; lists and `tidyGone` take separate arguments | the schema, then A2 | schema-strict | A2, behind the schema |
| A9 | a listing's pins (`Storable.del`, `Listing.#deliveryPlanOf`) | the revision and life tokens of a record | `revisionPins` | stripping | none: not an ask |

### Rulings (the Coach, 2026-11-11)

* `op: 'list'` on the list asks; four `classifyStored*` names; Convex functions take `{ ask }`; GraphQL lists keep their arguments.
* `tidyGone` takes `{ op: 'tidy_gone', applabel, user_id }`.
* A refusal names its verb as `oplabel` (was `call`), in `meta`, on the wire, and in the logger's story.
* `RowAt` is gone. The Coach's objection was its name, wrong in shape (it holds a row) and in size (two fields): pass
  the whole thing among friends rather than name a slice of it. The tables take the stored row, null for none, and read presence from it.
* No public release yet: wire and signature changes need no shims.

## Part 2: delivery by a plan

### First cut (built)

| step | where | decides from |
|---|---|---|
| 1. the world | `deliver`: `this.world.receiveWorld(answer.world)` | the answer's `world`; it may vacate this listing |
| 2. which row | `#deliveryPlanOf`, by `RowOfAct` | the act alone: `stored` (val, pinned to the record sent), `found` (val, pinned to the scope), `dbhas` (pinned to the scope), `nothing_stored`, or none |
| 3. which instance | `#rowPlanOf`, then `slotStepOf` (the vault listing's override) | what is listed at the row's scope |
| 4. do it | `#carryOut(plan)` | `SlotPlan.step`: `none`, `absent`, `make`, `keep`, `receive`, `remake` |
| 5. receive | `Storable.receive` -> `reconcileCentral` -> `adopt`, `align` | the thing's own receive table |

* `deliver` is synchronous: a refusal's row is received, and `panicIfRevoked` runs, before any other answer is delivered.
* The gate verbs are put-shaped, each a straight line through `#gateMoveOf(ante, moved)`.
* Act split: `revokePasskey` over a vault with no passkey answers `passed`, so the act table pins it to the scope.

### Call stack, from `tryPut`

* `deliver`: one hop; the three moves and the refusal's tail read in place.
* The world: the deepest, about eight hops over three files (`Vault.receiveWorld` -> `receiveRow` -> `buildOrReceive` ->
  `#rowPlanOf` -> `slotStepOf` -> `#carryOut` -> `Vault.receive` -> `reconcileCentral` -> `Vault.adopt`), and it can
  vacate the box listing that is delivering. A reader must know it.
* `#deliveryPlanOf`: one hop; `RowOfAct` is a table, the validators need no click; `#rowPlanOf` one more, `slotStepOf` in another file.
* `#carryOut`: one hop, then `receive` in `Storable` and its subclasses' `adopt`.

Decisions now live in four places: `RowOfAct`, the two planners, `slotStepOf`, and `reconcileCentral`.

### Second cut (for the Coach's yes)

Fold `slotStepOf` and `reconcileCentral`'s verdict (`older`, `same`, `fill`, `adopt`, `gone`) into the plan, so that
`Storable` adopts what the plan says and judges nothing: `notes/receive-contract.md`'s one table, read once. Then the
world's step is a plan of the vault listing's like any other row's.

## Leftovers

* `notes/gallant*.md` and `notes/old_vocabulary.md` keep names that are gone (`declined`, `#deliverGood`): reviewer and history material, left whole.
