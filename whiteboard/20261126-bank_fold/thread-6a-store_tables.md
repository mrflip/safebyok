# Thread 6a: store_tables (2026-11-27)

Branch `20261126-store_tables`, cut from `claude/bank-table-refactor-fr1ycq` at `8e548290d`, rebased onto its tip
`1edd21bff` (thread 6 world_names and thread 7 fold_docs). There is no PR of its own: the orchestrator carries the commits
onto #949. Proved after the rebase: `pnpm justify` green over the whole repository, 8,949 tests passed (safebyok 2,422,
safebyok-indexeddb 131, safebyok-react 339, the dojo 111, envman 24, knockknock 26).

## The rebase onto world_names

* **Conflicts**, each an import line or a test line where world_names renamed and store_tables reshaped; both stand:
  * `memory-datastore.ts`, `memory-vault-db.ts`, `idb-datastore.ts`: the rename's `GetBankAsk` / `GetBankManifest`, with
    store_tables' `Thingkind`, `BankRows` and `KindedThingScope` imports.
  * react's `react-giver.test.tsx` and `record-hooks.test.tsx`: world_names' gate at `WorldScope.banklabel` and
    `device.bank`, read through store_tables' `.gate` and `.box` tables.
  * `notes/vault-adapter-contract.md`'s Stats line: world_names dropped "its main gate among them", store_tables added
    "of both tables".
* **Repairs after it**, as their own commits:
  * The dojo opens `vault-v002-001-001` (`stores.ts`, `make-fixture.ts`, README), the Inspect tab reads a row's kind from
    its key's third element, and `fixture.json` is written again by `pnpm --filter safebyok-demo-dojo fixture`, each key
    now `[userid, banklabel, modelkind, labelpath]`.
  * safebyok-indexeddb's README names the new database and key.
  * The bank_fold changeset said to clear the IndexedDB database; it now says the old one is deleted unread at first use.

## Built

* **`MemoryDatastore`** keeps a table per kind, `#tables: Record<Thingkind, Map<ckey, BankRows>>`, the twin of
  Postgres's `safebyok_gate_things` / `safebyok_box_things` and Convex's `gate_things` / `box_things`. Each verb picks
  its table by the kind its ask already carries:
  * `ask.modelkind` for a get, a write and a listing;
  * `put.modelkind` for each put of a birth;
  * `'gate'` and `'box'` for the two roots.
  
  The ancestor and the children are read from the ask's table, because a Thing's ancestors are of its own kind. Stats
  read both tables.
* **`_cheat_things(scope)`** now returns `{ gate: BankRows, box: BankRows }`; it used to return one `Map<Labelpath, unknown>`.
  `BankRows` is exported from `safebyok/storage`. `ckeyOf` is unchanged.
* **The callers** of the cheat now go through `.gate` / `.box`, or `[Labelpath.modelkindOf(labelpath)]` where a test
  plants by scope:
  * the memory, minder, tsq-world, vault, vault-probe, device and bank tests;
  * graphql's `battery-memory`;
  * two react test files;
  * the envman and knockknock demos' `local-vault-db.ts`. Their saved shape is now `rows: [Thingkind, Labelpath, raw][]`,
    and an old `things` entry reads as no bank.
* **IndexedDB** keeps the two tables as two key ranges of its one object store. The key is
  `[userid, banklabel, modelkind, labelpath]`, and each verb chooses the range by its ask's kind, as memory does.
  `VaultDBVersion` is now `002-001-001`. The test cheat finds the kind from the labelpath, and says so.
* **`notes/vault-adapter-contract.md`** says a datastore keeps a table per kind, chosen by the ask's kind and never by
  reading the labelpath. The ancestor and the children are in the ask's table, the atomic unit spans both tables, and
  IndexedDB's tables are key ranges.
* **New tests:** memory's "keeps a bank's gate in the table of gates, and its root box in the table of boxes", and
  IndexedDB's twin of it, over the raw keys.

## Decisions made

* **IndexedDB has a key range per kind, not an object store per kind.** This is open; see *For the Coach*.
  idb-keyval's `createStore` opens one object store per database, and big's `versionedShelfOf` builds on it. Two
  databases would lose the atomic unit a birth needs. The choices:
  * **(A)** the `idb` library, a new runtime dependency to be proposed;
  * **(B)** a hand-rolled multi-store variant of `createStore` and `versionedShelfOf`, which would broaden frozen big;
  * **(C)** the kind in the key, which is built.
  
  Under PROCESS.md *Dependencies* and CLAUDE.md "Library first", A and B each need a yes before they exist. C needs
  neither, and moving from C to B later keeps every verb's choice of kind: only the shelf changes.
* **Stats in IndexedDB** read each kind's range and join them (`thingkindVals.map`), as memory reads each table. I set
  aside one range over the whole bank: it would serve both kinds in one read, but it is not a per-kind table.

## Deviations

* The Coach's "an object store per kind" is answered with key ranges (above).
* bank.test's `.get('gate')` was vacuous: the gate is at the banklabel. It now reads `.gate.get(GateScope.labelpath)`.
  The react tests read the gate at `WorldScope.banklabel` since the rebase (thread 6 fixed the labelpath).

## Discoveries

* **The dojo demo and safebyok-indexeddb's README** went stale under this thread (the database name and the key); both
  were brought up to date after the rebase, above. The dojo's `stores.ts` still hard-codes the database name, since
  safebyok-indexeddb exports no name for it: the next version bump will strand it again.

## For the Coach

* **Ruling needed: the IndexedDB tables.** A, B or C, above. My recommendation is C, held moderately firmly. B is the
  literal twin, but it means hand-rolled IndexedDB plumbing in frozen big.
* **What an existing IndexedDB user sees:** on first use, `safebyok[-<dbName>]:vault-v001-001-001` is deleted unread
  and `…vault-v002-001-001` is opened empty. The vault reads as unborn, so the user creates a bank afresh, or another
  device's data does not come back from this store. There is no migration.
* **The boundary list** follows: where a datastore hands the core a row, and the core works out its kind from the
  labelpath. It is also in the handback.
  * `manifest-acts.ts` `checkedRowOf`: `ThingkindChecks.ofLabelpath(labelpath).stored.parse(row)`. `ask.modelkind`
    is right there.
  * `checkedParentOf`: `ThingkindChecks.ofLabelpath(labelpath).listed.parse(row)`. `ask.modelkind` would do.
  * `checkedAncestorOf`: `ThingkindChecks.ofLabelpath(abovepath).stored.parse(row)`. The ancestor is in the ask's
    table, so `ask.modelkind` would do.
  * `checkedWatchedOf`: `ThingkindChecks.ofLabelpath(scopeReport.data.labelpath)`. `Received` could carry the
    `modelkind` of the table written.
  * `vault-stats.ts` `vaultStatsOf`: `(Labelpath.modelkindOf(labelpath) === 'box') ? box : gate`. The datastores
    could hand rows by kind, `{ gate: FiledRaw[], box: FiledRaw[] }`.
  * `three-way.ts` `isChildLabelpath`: `Labelpath.isOfModelkind(labelpath, ask.modelkind)`. This one checks against
    the ask's kind; with tables it is always true.
  * Downstream of a notice: `agerank.ts` `modelkind: Labelpath.modelkindOf(labelpath)`, `bank.ts`
    `thingClassOf(Labelpath.modelkindOf(seen.labelpath))`, `shapes-vault-event.ts`'s EventModelkind refine,
    `base-thing.ts`, `vault-tsq.ts` isBox. All would follow `Received.modelkind`.
  * Convex's own `docAt` and `childrenIn` pick a table by `tableOf(labelpath)`, and so do the Postgres, Convex, memory
    and IndexedDB test cheats.
