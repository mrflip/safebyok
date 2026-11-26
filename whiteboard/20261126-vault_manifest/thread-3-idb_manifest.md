# Thread 3: idb_manifest (2026-11-26)

Branch `20261126-idb_manifest`, PR [#939](https://github.com/mrflip/safebyok/pull/939), stacked on [#937](https://github.com/mrflip/safebyok/pull/937). Proved: `pnpm justify` after the catch-up rebase: red only in safebyok-postgres (107 of 170 tests, lint, typecheck) and safebyok-convex (149 of 231, lint, typecheck), threads 4 and 5; green: safebyok-indexeddb 130, safebyok 2,412, safebyok-react 339, e2e 576, root 331, dojo 111, demos react 99, envman 24, knockknock 26, every -big package.

* **Built**:
  - `packages/safebyok-indexeddb/src/idb-datastore.ts`: `IdbDatastore`, laid out as `MemoryDatastore` is
    (`getThing`, `writeThing`, `listThings`, `birthBank`, `getWorld`, `stats`, `watch`), each verb one `DB.inOneStep`
    transaction whose body is the datastore step and which returns a manifest. It reads no check and no act table;
    tags come from `ManifestTags` over the ante row; whether to write comes from `isWritable` / `isBirthWritable`.
    It also holds the shelf (quota-refusing wrapper), the bell and the BroadcastChannel watch, as MemoryDatastore
    holds its watchers. Rings follow a commit that wrote (`manifest.tags.written`).
  - `idb-vault-db.ts` is now what `MemoryVaultDB` is: options check, then each `do*` one line to the datastore.
    `vault-shelf.ts` is untouched (`childrenIn`, `bankThingsIn` give `{ labelpath, raw }` as the contract's children).
  - `safebyok/storage` exports `isWritable` and `isBirthWritable` from `memory-datastore.ts`, so no copy of the predicate
    exists in the idb package ("reuse it if it is exported").
  - Dojo demo: green with no change of its own (typecheck, lint, 111 tests); it was red only through safebyok-indexeddb.

* **Decisions made**:
  - A separate file and class, not a bag of functions in the vaultDB: the same shape as memory, and the unit thread 4
    and 5 will copy. `IdbDatastore` is not exported from the package: only the vaultDB is public.
  - The world, listing and stats reads inside a transaction are awaited one after another or in `Promise.all` over
    plain `rowAt`s; each row reported is the one read at the step's last read (the roots are read again after a write).
  - The quota is still read before the transaction (an await on anything else ends an IndexedDB transaction), and
    caps `max.size` only.

* **Deviations**: none from the plan. The stale eslint comments naming `storage/classifier.ts` in the idb and dojo configs
  are left alone (config copies, not this thread's).

* **Discoveries**: none that change the contract. An IndexedDB write and its re-read are in one transaction, so the
  written row the manifest reports is the one actually stored.

* **Approaches set aside**: copying `isWritable` into the idb package (it is exported now); keeping the do* bodies in
  the vaultDB with module-level helpers (does not mirror memory, and hides the verbs).
