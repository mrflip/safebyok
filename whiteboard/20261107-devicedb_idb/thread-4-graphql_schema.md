# Thread 4: graphql_schema (2026-11-07)

Branch `20261107-graphql_schema`, PR #571 (draft), stacked on #569 (thread 2, `20261107-idb_devicedb`). Status: **blocked after
two compactions**, milestone 1 (core) committed; milestones 2-4 not begun. Justify green: core 2,368, indexeddb 107
(2 skipped), postgres 123, convex 227, fastkey 49, graphql 210 (3 skipped), e2e 200.

Authority: the Coach's rulings in `vaultdb_cleanup-plan.md` *8. graphql_schema* (on `origin/20261106-vaultdb_cleanup`)
and `devicedb_idb-plan.md` *4. graphql_schema*.

* **Built** (commit `3f4f21bf7`, all in `packages/safebyok`):
  * **`VaultDBVerbs`** (`src/storage/vault-db-new.ts`, *What a model calls*), exported from `safebyok` and
    `safebyok/storage`: the brand plus each plain and `try*` verb, typed explicitly. **`VaultDBVerbnames`** lists the 23
    verbs, held equal to the interface's keys by a type assertion. `abstract class VaultDB implements VaultDBVerbs`.
  * **Acts as enums**: `listActVals`/`ListAct`, `gotActVals`, `putActVals`, `delActVals` in `shapes-enums.ts`;
    `vault-db-new.ts` re-exports the types. `listVaults`/`listBoxes` answer `ListAct`.
  * **The duck check**: `brandedVaultDB` (`shapes-vaultish.ts`) asks for the brand and every verbname as a function;
    `isVaultDB` stays brand-only. `BankOpts.vaultDB`, `ListingOpts.vaultDB` and `Listing.vaultDB` are `VaultDBVerbs`.
  * **Answer checkers** `src/shapes/shapes-answers.ts` (`AX`), exported from `safebyok/storage`: one per front verb
    (`listVaultsAnswer` ... `delBoxAnswer`), `crossedNotice` for a watch, and the parts `crossedErr`
    (`{refusalkind, message, meta: {capacity, fieldnames, call} | null}`), `crossedReqParams` (each field nullable),
    `damagedVault`, `damagedBox`. All strict, all `unexpected_error`. Null stands for absent; each parses to the core's
    `Answer` (null req_params fields dropped, `dbhas` null when none, the refusal a `VaultError` whose meta holds the
    crossed fields plus act/world/dbhas/req_params, no cause). Tests: `tests/shapes/shapes-answers.test.ts` round-trips
    a MemoryVaultDB's answers through a JSON wire; `validator.test.ts`'s sweep now includes AX.
  * **The battery over any `VaultDBVerbs`**: `describeVaultDBBattery<DBT extends VaultDBVerbs>`, with a new hook
    `_cheat_storeOf(vaultDB) => VaultDB`. It names the store behind a client, where `tidyGone` and the races' rival
    writes go.
* **Decisions taken**:
  * **The interface is named `VaultDBVerbs`**, and the class keeps the name `VaultDB`. Set aside: renaming the class
    (`VaultDBBase`), which churns five packages.
  * **`tidyGone` is out of the interface** and so out of GraphQL, by "exactly (and pretty much only) the front-end
    verbs". This supersedes the earlier consensus "Tidied is a type of its own" for the wire. The battery reaches it
    through `_cheat_storeOf`, which also replaced the planned `tidies` option.
  * **Answer checkers are per verb**, the Coach's lean, built by one `answerCheck({val, acts, world, badWorld,
    dbhas})`. A good answer must carry `err: null`, a bad one `val: null`.
  * **Unknown fields are refused** (strict), never stripped: this is my reading of "everything should be nulled as it
    leaves the first validator it hits". The core's own record checkers were not changed. `reqParams`
    (partial) is unchanged too; the wire form is the separate `crossedReqParams`.
  * **The wire error field is `refusalkind`**, the core's name, not `kind`.
  * **A wire failure is `unexpected_error`**: an answer failing its checker. Not yet built: a GraphQL error would be
    `unexpected_error` with its cause, and a network failure `storage_unavailable`.
* **Deviations**:
  * **The relay stays** (`VaultDB.relay`, `VaultDBRelay`, the `relayed` helper and its tests). Removing it breaks
    `safebyok-graphql` until milestone 2 rewrites the resolvers onto the verbs. Milestone 2 removes it and adds the
    breaking line to the changeset.
  * Removed a stale `eslint-disable-line @typescript-eslint/class-literal-property-style` on the brand getter: the
    rule stopped firing once the class implements the interface.
* **What remains** (milestones 2-4), the plan as the summary had it:
  * **2. Schema and server** (`safebyok-graphql`, rewritten):
    * The front verbs (listVaults, getVault, listBoxes, getBox, putVault, putBox, replacePassphrase, addPasskey,
      revokePasskey, delBox, delVault) as queries and mutations, plus a `safebyokWatch` subscription.
    * Answer types per verb family, `{ok act val world dbhas req_params err}`, with an `EpochMillis` scalar and a
      `SafebyokJson` scalar for sidecar, `damaged_rows`, `meta` and `err.meta`. Unions for live and tombstone rows.
      `damaged_rows: [SafebyokJson!]!` is the only slot a damaged row may hold.
    * Each resolver runs the user_id gate (the scope's user_id must equal `userIdOf(context)`), calls `vaultDB.tryX`,
      and returns the whole answer, err mapped from a fixed list, never a spread, and no cause.
    * A stream revoked mid-way ends with `identity_revoked`. maxRecordBytes moves to the server's store.
    * Remove the relay.
  * **3. Client**: its own class implementing `VaultDBVerbs` over urql, parsing each answer with AX.
    * urql's cacheExchange adds `__typename` and does not export `maskTypename`. Drop `__typename` by explicit paths,
      never a deep strip, which would corrupt a sidecar key.
    * Resubscribe after a stream ends (an opt `resubscribeMillis`, about 1000), except after `identity_revoked`.
  * **4. Finish**:
    * A drift test walking AX against the schema.
    * The battery over GraphQL, `_cheat_storeOf` naming the server-side store.
    * yoga and e2e.
    * READMEs, the core's and GraphQL's: the host must vacate a bank on any user_id change.
    * Changesets, and GraphQL's doc blocks.
* **For the Coach**: the open matters below, each a two-way call.
  * **Interface name** `VaultDBVerbs`, keep it.
  * **tidyGone excluded** from the interface and wire, keep it excluded.
  * **Per-verb answer checkers**, keep them.
  * **Refuse, don't strip**: refuse unknown fields at the client; leave the core's record checkers as they are.
  * **The wire error field is `refusalkind`**, keep it.
  * **Wire failure kind**: `unexpected_error`, rather than a new refusalkind.
  * **`_cheat_storeOf`** as the battery's hook, keep it.
  * **`__typename` dropped by path**, as planned.
  * **The resubscribe delay** fixed at about 1s, as planned.
