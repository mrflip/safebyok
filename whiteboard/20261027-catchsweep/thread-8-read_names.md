# Thread 8: read_names (2026-10-28)

Branch `20261028-read_names`, PR #TBD, stacked on #321 (thread 6, `20261028-store_trynames`, tip
496e3046), which stands on #324, #317 and #316. Justify: green (core 3475 pass, 37 skipped;
indexeddb 167, postgres 322, fastkey 49, react 310, convex 367, graphql 344, demo 230, e2e 107,
root scripts 266; every package lints, typechecks, builds and fits its size budget).

* **Built**: every operation under `packages/*/src` that was a `read` or a `write` is named for
  what it does, in one `api:` commit, behaviour untouched (no kind, message or order changes):
  - `StringStore.read`/`write`/`erase` → `get`/`put`/`del` (`string-store.ts`, `memoryStore`,
    `domStore`, their doc examples; `local-vault-db.ts`'s validator `obj({ get: call, put: call,
    del: call, ... })`, still in a `Validator` call, and its callers; `readJson` → `getJson`); every
    caller in the core's tests, the react and convex tests, the demo's `auth.ts`, `StoreTable.tsx`
    and tests, and the hand-built stores in `del-damaged-vault.test.ts`, `local-vault-db.test.ts`
    and `test-helpers.test.ts`.
  - `KeptLease.tryRead` → `KeptLease.tryGet` (`lease.ts`: the method name and its doc block, nothing
    else in a guarantees file); callers in `bank.ts`, `vault.ts` (two), `device-db.ts`'s doc;
    `notes/guarantees.md` at its three mentions.
  - `held-lease.ts`: `readers` → `leaseGetters`, `registerLeaseReader(vault, read)` →
    `registerLeaseGetter(vault, getLease)`; callers in `vault.ts` and four test files;
    `notes/security.md` line 446 by a `sonnet` subagent, per its header.
  - `refusals.ts`: `staleWrite(what)` → `staleDel()`; `StaleWriteVals`, `StaleWrite` and the
    `StaleWriteSaid` record are gone, the one message is `StaleDelMessage`, exported like
    `StaleBoxMessage`. Callers: `vault-db.ts` (two), `outcome.ts`'s example, four test files;
    `index.test.ts`'s key list names `staleDel` and `StaleDelMessage`. The kind is still
    `'stale_write'`.
  - `device-db.ts`: `#readableOf` → `#parsedOrDel`. `doDelUnreadable` is untouched.
  - `vault.ts`: `#readBox` → `#getBox`, `#boxReadRefusal` → `#boxGetRefusal`, `#writeOver` →
    `#putOver`, `#takeOwnWrite` → `#takeOwnPut`, `#gateWriteRefusal` → `#gatePutRefusal`; the
    Outcome locals `read`/`written` → `got`/`put`; the refresh family `#readStorage` →
    `#refreshOnce`, `#readRefused` → `#refreshRefused`, `#readAt` → `#refreshedAt`, `#judgeRead` →
    `#judgeStored`, `#takePicture`'s `readAt` → `refreshedAt`, `BirthRead` → `Birth` with
    `refreshedAt`; `bank.ts`'s local `readAt` → `refreshedAt`. Banners: `[Refreshing]`, `[Getting
    boxes]`, `[Putting boxes]`, `[Ways in]`'s names. The doc blocks and running comments of the
    renamed members say the operation (refresh, get, put); prose elsewhere is left for the
    documentarian.
  - `idb.ts` local `reading` → `getting`; `vault-opts.ts`'s request-guard local `reading` → `now`.
  - graphql `vaultReadOf` → `storedVaultOf`, `WriteAnswer` → `PutAnswer`; convex
    `ReadOutOfDateMessage` → `GetBoxOutOfDateMessage`, `OutOfDateMessage` → `PutOutOfDateMessage`;
    react `readListed` → `getListed`; `shapes/vault.ts` and `shapes/box.ts` examples
    `myBackend.readRow(id)` → `getRow`.
  - `notes/old_vocabulary.md` gained five rows for these renames; `STYLE.md`'s two doc-block
    examples that named `#readBox` now name `#getBox` (the text beside them already said "never
    `readBox`").
  - Changesets: `safebyok` minor naming every exported rename; one patch for react, convex and
    graphql. indexeddb's code did not change (`idb.ts` is the core's).
* **Decisions taken**:
  - `#getBox`, not `#fetchBox`: STYLE.md's *Naming* says a method that does its work by calling
    `getBox` keeps that verb, the verbs table has no `fetch`, and the `#` sigil tells it from the
    public `getBox` at every call site and in a grep for `#getBox`.
  - `#judgeStored(stored, record)`, not `#judgeGotten`: it names what is judged (the vault as
    `VaultDB.getVault` found it, as `storedVaultOf` and `box_stored` name theirs), where `gotten`
    names the act. The local in `#takeStorage` is `stored` too.
  - The rest of the refresh family took the handoff's names: `#refreshOnce`, `#refreshRefused`,
    `#refreshedAt`, `refreshedAt` (in `#takePicture`, `Birth` and `bank.ts`), `Birth`. One name per
    thing: the birth's `refreshedAt` is the vault's first, and `Birth`'s field doc says so.
  - `isPartial`, not `getFirst`, for `#sealAndPutBox`'s boolean: the linter
    (`unicorn/no-non-function-verb-prefix`) refuses `get` on a non-function, and `#storedBase`'s doc
    already calls it "a partial `putBox()`".
  - `domStore`'s doc keeps "hears only this tab's writes": any mutation is meant there, the generic
    use CLAUDE.md allows. `StringStore`'s class doc says "as a put or a del lands".
* **Deviations**: `STYLE.md` (two example lines) and `notes/old_vocabulary.md` (five rows) were
  not in the handoff; both named retired identifiers. Reported for the orchestrator to strike or
  keep.
* **Discoveries**:
  - `KeptLease` and `held-lease.ts` are exported from no entry point, so `tryGet` and
    `registerLeaseGetter` are internal renames; the changeset says so.
  - For thread 7 (vault_bank_flip): every `vault.ts`/`bank.ts` change is an identifier inside a
    body, a doc block of a renamed private member, or a banner; no body moved. The restack will
    replay them onto the moved bodies. The locals it will meet: `stored`/`got`/`put` for the
    Outcomes, `isPartial`, `refreshedAt`.
  - For thread 3 (db_hooks): `vault-db.ts` changed at two lines only (`Refusals.staleDel()`); its
    internals (`readVault`, `readStoredVault`, `checkWritten*`, `ReadAnswer`, `VaultReadResponse`)
    are untouched, as the handoff said.
  - No `eslint-disable` or `@ts-expect-error` added.
* **For the Coach** (each waits on a ruling; left as is):
  - **`written_at`**, the stored field. Rec keep.
  - **The refusal kind `'stale_write'`** that `staleDel`, `staleBox` and `staleVaultRecord` make.
    Rec `'stale_del'` for the deletion's, named in the changeset; a kind rename is a contract call.
  - **Convex `GetBoxAnswer.read`**, the protocol field between component and client. Rec `got`.
  - **`doDelUnreadable(scopepath, isReadable)`**, the protected adapter hook every DeviceDB
    implements. Rec `doDelUnparsed(scopepath, isSound)`.
