# vaultdb_asks: the vaultDB buttonup, then the deliver/receive rat king

Worktree `/workspace/byok-vaultdb_asks`, branch `20261111-vaultdb_asks`, cut from `20261111-names_ruled` (efe628691).

## Part 1: the vaultDB buttonup

### The ask, the length of the call stack

| # | Where | Shape | Validator | Strict? | Shares a validator with |
|---|---|---|---|---|---|
| A1 | host -> listing (`put(record, opts)`, `get(scoped, opts)`, `del(sparse)`) | a record or scope, plus opts (`PutOpts`, `FetchOpts`) | `putOpts`, `fetchOpts`, `recordOf`, `scopeOf` | generous: defaults (`ifAbsent: 'add'`, `ifPresent: 'repl'`), extras stripped | none: not an ask, and stays so |
| A2 | listing -> vaultDB verb | `VaultGetAsk` ... `BoxDelAsk`, plus the new `VaultListAsk` `{ op: 'list', applabel, user_id }` and `BoxListAsk` `{ op: 'list', ...vaultScope, vault_tok }` | `vaultGet` ... `boxDel`, `vaultList`, `boxList` | strict, no defaults, refinements across fields | A3, A4 (same object, parsed once) |
| A3 | vaultDB -> adapter `do*` | the ask as A2 parsed it | none (trusted past the entrypoint) | | A2 |
| A4 | adapter -> classifier | the same ask; the tables read slices of it (`ifAbsent`, `ifPresent`, `expected`, `record`'s revision) | none | | A2. `Asked`, `GetAsked`, `PutAsked`, `DelAsked` go: the tables take `VaultPutAsk \| BoxPutAsk` and so on |
| A5 | Convex mutation, server side | the ask, re-parsed (anyone signed in can call it) | `vaultPut` etc. again | strict | A2 |
| A6 | answer's `ask`, a refusal's `meta.ask` | `LoggableAsk`: `{ op?, applabel?, user_id?, vaultlabel?, boxlabel?, vault_tok?, ifAbsent?, ifPresent?, gateVerb?, expected?: RowMeta, record?: RowMeta }`, every field optional, a record cut to its meta | `loggableAsk` | generous: partial, strips the payload | none: A2 must refuse what this keeps |
| A7 | an answer on the wire (GraphQL) | `CrossedAsk`: A6 with null for each absent field | `crossedAsk` | strict, nulls | none: nulls where A6 has absence |
| A8 | GraphQL inputs | `SafebyokVaultGetAskInput` etc.; lists and `tidyGone` keep their separate arguments | the schema, then A2 in the vaultDB | schema-strict | A2, behind the schema |
| A9 | models' pins (`Storable.del`, `Listing.#deliverGood`) | address plus revision of a record or scope | today `reqParams` / `reqParamsOf`, used as a picker | | none: not an ask. Part 1 swaps in `loggableAsk`-free picks; part 2 (deliver) owns it |

Gone: `ReqParams`, `reqParams`, `requestParams`, `reqParamsOf`, `CrossedReqParams`, `crossedReqParams`, the answer's
`req_params` (now `ask`), the classifier's `Asked` family, `VaultQuery` and `BankScope` as a list verb's argument.

### The type passed up from an adapter

* `VaultClassified` / `BoxClassified` become `VaultStored` / `BoxStored`; lists gain `VaultsStored` / `BoxesStored`.
* `classifyVault` / `classifyBox` become `classifyStoredVault` / `classifyStoredBox`; lists gain
  `classifyStoredVaults` / `classifyStoredBoxes`, which take what `listedRowOf` and `listedBoxesOf` did in the base.
* The classifier's private `Stored<RowT>` (`{ presence, row }`) becomes `RowAt<RowT>`, after `vaultRowAt` and `boxRowAt`
  that make it, so `Stored` means one thing.
* What the datastore hands back keeps its `*Fetched` names; `BoxesFetched.vault` becomes `world`, as `BoxFetched` has it.

### The verbs

* Every verb has the `put` shape: the throwing form is `goodOrThrow(await this.tryX(ask))`; the try form parses, calls
  `do*`, and makes the answer from what the classifier returned, its `catch` making the refusal. `answerOf(thunk)` goes.
* `listVaults(ask: VaultListAsk)` and `listBoxes(ask: BoxListAsk)`; `tidyGone(scope)` keeps its scope, and its answer's
  `ask` is the bank scope with no `op`.
* No buried ledes: `const fetched = await this.#fetchVault(ask)` / `const stored = this.classifyStoredVault(ask, fetched)`.
* A callee picks its own fields: `getVaultDoc(db, ask)`, never `getVaultDoc(db, DB.vaultScope.parse(ask))`.

### Calls I made that you may overrule

1. **`op: 'list'` on the list asks**, so they are asks like any other and the answer's `ask` has a tag.
2. **`tidyGone` keeps a `BankScope`.** It is housekeeping, not a classified ask.
3. **Four classify names, not one `classifyStored`.** One name for vault and box would need an overload that branches on
   the ask's kind; one plain function per kind reads better when you debug.
4. **Convex queries take `{ ask }`** and pick the scope server side, as the mutations already do.
5. **GraphQL lists keep separate arguments**: the schema's header says so on purpose; the resolver builds the ask.

### Built (uncommitted in the worktree, `pnpm justify` green)

Departures from the plan above:
* No `VaultsFetched`: `classifyStoredVaults(ask, vaults)` takes the bare `RowOfVault[]`.
* A9 got `SX.revisionPins`, an `objStrip` of the optional `revision_tok`, `revision_seq`, `vault_tok`, `box_tok`: not an
  ask, a picker for `Storable.del` and `Listing.#deliverGood`. Part 2 should make it unneeded.
* `vaultAnswerOf` and `boxAnswerOf` are gone: each verb builds its answer inline (fatter, fewer methods).
* `GraphQLVaultDB` lost its closure-taking `answerOf(call, checked, ask)`: each verb is the same blunt try/catch, its
  refusals made by `answerForRefusal`, as `AdapterVaultDB`'s are. A client-side refusal now carries `call` and `ask`.
* Convex `getBox` / `listBoxes` return `world`, not `vault`, so every fetched shape is "world and row".
* Postgres's `ListBoxesWithVaultSql` aliases its vault column `world`.
* React tests that spied on `listVaults` now stub `tryListVaults` with a resolved bad answer: the listing calls the try form.

## Part 2: deliver / receive / receiveWorld / fate

Read `notes/receive-contract.md` before starting. Not begun.
