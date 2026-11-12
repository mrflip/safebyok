# vaultdb_asks: the vaultDB buttonup, then the deliver/receive rat king

Worktree `/workspace/byok-vaultdb_asks`, branch `20261111-vaultdb_asks`, on `main`.

## Status

* Part 1, the vaultDB buttonup: built and committed, with the Coach's rulings of 2026-11-11.
* Part 2, delivery by a plan: built, both cuts, with the Coach's names of 2026-11-12, and the chute after the Coach's fingerpaint of 2026-11-12 (kept whole on branch `20261111-vaultdb_asks-fingerpaint`).

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
| A9 | a listing's pins (`Storable.del`, `Listing.#answerDeliveringOf`) | the revision and life tokens of a record | `revisionPins` | stripping | none: not an ask |

### Rulings (the Coach, 2026-11-11)

* `op: 'list'` on the list asks; four `classifyStored*` names; Convex functions take `{ ask }`; GraphQL lists keep their arguments.
* `tidyGone` takes `{ op: 'tidy_gone', applabel, user_id }`.
* A refusal names its verb as `oplabel` (was `call`), in `meta`, on the wire, and in the logger's story.
* `RowAt` is gone. The Coach's objection was its name, wrong in shape (it holds a row) and in size (two fields): pass
  the whole thing among friends rather than name a slice of it. The tables take the stored row, null for none, and read presence from it.
* No public release yet: wire and signature changes need no shims.

## Part 2: delivery by a plan (built)

| step | where | decides from |
|---|---|---|
| 1. the world | `deliverAnswer`: `this.world.receiveWorld(answer.world)` | the answer's `world`; a vault deleted or made anew remakes the Vault, which vacates its boxes |
| 2. where the record is | `#answerDeliveringOf`, by `deliveryFieldingOf` (`as const satisfies` every act) | the act alone: `as_sent`, `as_got`, `as_db`, `void`, `none`; null for nothing to deliver |
| 3. the receive table | `#recordDeliveringOf` | the record against the instance listed, read once: `making` (`listed`, `make`, `remake`) and `mod` (`older`, `same`, `adopt`), or a refusal |
| 4. do it | `#doDeliverRecord({ making, mod, listed, record })` | the plan, every form with every field, null where none; the thing adopts (`receiveRecord`) or is marked refreshed (`markRefreshed`), and judges nothing |

The entries into the chute:

| entry | enters at | why there |
|---|---|---|
| `deliverAnswer(answer, sent)`: get, put, del | step 1 | an answer has a world, an act, a sent, and maybe a refusal to throw |
| `#deliverListing(answer)`: list | step 1, then `deliverRecord` per row | a listing's world and damaged rows are its own; each row is a record |
| `#onNotice(notice)`: watch | its world, then `deliverRecord` | a notice has no ask and no sent; its acts `got`/`gone` are not the classifier's |
| `deliverRecord(record)`: `Vault.receiveWorld`, `BoxListing.#shellFor`, tests | step 3 | a bare record: no act, no sent, nothing to field |

* The Coach's names of 2026-11-12: `deliverAnswer`, `answerDeliveringOf`, `deliverRecord`, `recordDeliveringOf`, `doDeliverRecord`, `deliverListing`, in that order in the file.
* The get chute: `thing.fetch` → `thing.hydrate` (its own record, if timely, answers: a swept thing too) | `vault.getBox` → `listing.get` → `tryGet` | `bank.tryProbe` (opts, world, the timely instance listed, then joined by scope) → `#doGet` (`doTryGet`, `deliverAnswer`). `listing.fetch` is gone: `maxMillisSinceRefresh: 0`. Each method's doc block carries its `Chute:` line. A chute takes many entries; once joined, nothing downstream knows which (the Coach, 2026-11-12).
* Every refusal met is thrown first-come: a refusal's own err, then what delivering met, told as bad news; a list delivers every row, throws the first refusal and tells the rest.
* A new instance is made at the void revision and handed its record by `receiveRecord`: a vault made from a tombstone forgets the lease cached on this device (pinned by a test).
* `slotStepOf`, `SlotStep`, `reconcileCentral`, `receive`, `tombstoneFor`, `CentralPolicy`, `Reconciled`, `shapeUnreconciled`, `otherVaultTok`, `build`, `receiveRow`, `buildOrReceive` are gone.
  A vault listing says `isOneLifePerInstance`; a box listing does not.
* Acts are closed sets: `goodActVals`, `badActVals`; a refusal the classifier never saw is `unclassified_storing`, its refusalkind on `err`.
* The policy validators (`ifPresent`, `ifAbsent`, `putIfAbsent`, `anyIfAbsent`) live once, in `shapes-storage`.

### Open with the Coach

* Notices through `deliverAnswer`: not taken (cost above). "Slot" stays the word for the place at a scopepath (doc comments, the phrase `DelOfOtherLife`): not in VOCABULARY.md.
* The refused `void` act fields `none`; a gotvoid fields `void`.

## Leftovers

* `notes/gallant*.md` and `notes/old_vocabulary.md` keep names that are gone (`declined`, `#deliverGood`): reviewer and history material, left whole.
