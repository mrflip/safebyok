# Thread 5: convex_manifest (2026-11-26)

Branch `20261126-convex_manifest`, PR [#941](https://github.com/mrflip/safebyok/pull/941), stacked on
[#939](https://github.com/mrflip/safebyok/pull/939) (thread 3, `20261126-idb_manifest` at `517463cf4`; sprintbase
recorded). Proved: `pnpm justify` after the catch-up: red only in safebyok-postgres (lint, typecheck, 107 of 170
tests; thread 4 mends it), and in timeouts under load in the dojo demo, the envman demo and e2e, each green run alone
(dojo 111, envman 24, e2e 576). Green: safebyok-convex 232, safebyok 2,412, safebyok-indexeddb 130, safebyok-react 339,
root 331, knockknock 26, react demo 99, every `-big` package.

* **Built**:
  - `packages/safebyok-convex/src/component/schema.ts`: three tables, `bank_things`, `gate_things`, `box_things`, a
    typed field per Postgres column (`vault-tables.ts`): strings, `revseq`/`born_at`/`written_at` numbers, the bank's
    `lifetok` a string; `v.any()` only where Postgres has jsonb (gate `wayins`, `auth`, `sigs`, `meta`; box `sidecar`,
    `whisper_sealed`). Each table has `by_scope` and `by_commit`. `ThingTables` and `tableOf(labelpath)` live here too.
  - `src/component/things.ts`: the datastore. Each query or mutation hands back a manifest less its `read_tc`, laid out
    as `MemoryDatastore` and `IdbDatastore` are: tags from `ManifestTags`, the write decided by `DB.isWritable` /
    `DB.isBirthWritable`, rows read back after any write, `ancestor` only where `actual` is null. No classifier, no act
    table. A row is the document less `_id`, `_creationTime` and `commit_ts` (`rowOf`).
  - `watchThings` reads `by_commit` in each of the three tables, sorts the documents by `commit_ts`, and hands back
    `{ things, banktok, cursor }`, the cursor the last document's `commit_ts`. A null cursor still reads nothing.
  - `src/component/validators.ts`: `getManifest` … `statsManifest`, `thingsWatched`; rows, tags and children are `v.any()`.
  - `src/convex-vault-db.ts`: each `do*` is `{ ...(await call), read_tc }`; `demandUnwritten`, `checkedWritten`,
    `storedOutOfStep` and `Phrases.StoredOutOfStep` are gone; `ConvexBankLimits` moved into the component's `stats`.
  - Core (directive from thread 2's review): `ManifestTags.banktokOf` gives null, not undefined, for a bank row
    without a lifetok; the contract's "send null where a transport drops undefined" line is gone, and its banktok line
    says null. The battery's damaged-bank case answers as before (safebyok 2,412 green).
  - README *What it promises* / *What is stored* / *Upgrading*; changeset `safebyok-convex` minor (stored format).

* **Decisions made**:
  - **`read_tc` stays made by the client, before the call** (as thread E chose): a query's `Date.now()` is frozen at
    its start, and Convex serves a cached query result again, so an in-step stamp could make a later call answer an
    earlier read_tc. The component's validators and types are each manifest `Omit<…, 'read_tc'>` (`Observed<>`).
  - **The watch sorts by `commit_ts`** across the three tables, so notices keep commit order as the one index did.
  - **The test plant drops fields its table lacks**, as Postgres's plant does through `jsonb_populate_record`. The
    battery plants a bank with a stray `auth`; Convex refuses an unknown field, so without this the case cannot be
    planted. As in Postgres, that case then plants a sound bank.
  - `children` in `listManifest` is `v.any()`, matching `ListManifest.children: unknown`.

* **Deviations**:
  - A component that disagrees with the client on whether it wrote now refuses `storage_issue` (the three-way check),
    not `unexpected_error` (the old `StoredOutOfStep`). Broken state only; tests and README say so.

* **Discoveries**:
  - Convex's schema validation refuses a document with a field its table lacks, where Postgres's plant silently drops
    it. A damaged row of the right types (a bad lifetok string, malformed wayins) still stores and reads as damaged.
  - Exporting `ThingTables`/`tableOf` from `schema.ts` keeps them out of `things.ts`, whose exports become the API.

* **Approaches set aside**:
  - Typed Convex validators for the tags (unions of literals): the vaultDB checks every tag with `ManifestChecks`;
    duplicating them in Convex adds a second place to keep in step and checks nothing more.
  - `read_tc` made in the step, per the contract's first option: see the decision above.
  - A null-cursor watch that reads the bank row or the ranges: either makes the first query reactive, and its re-run
    would return a fresh snapshot cursor past a commit it never sent.

* **For the Coach**: confirm `read_tc` stays client-made for Convex; confirm the test plant's field dropping, mirroring
  Postgres's.
