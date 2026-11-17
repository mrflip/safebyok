# Thread 4: indexeddb_package (2026-10-15)

Branch `20261015-indexeddb_package`, PR #77, stacked on #70 (gripe_fixes
`vaultdb_validation`, cut at `d874db3`). Justify: green -- root 105, safebyok 734, safebyok-convex
267, safebyok-indexeddb 101, safebyok-react 28, demo 62; publint, attw and `pnpm size` clean.

* **Built**:
  - `packages/safebyok-indexeddb/`, packaged as `safebyok-postgres` is (ESM + CJS through tsdown,
    `safebyok` a peer, eslint cut from the core's with only its names changed, version `0.0.0`,
    in the `fixed` group). `idbVaultDB({ dbName })` and `inspectIdbVaultDB({ dbName })`, with
    types `IdbVaultDBOpts`, `IdbRow`, `IdbVaultInspector`.
  - Laid out as a key-value template: `ckeys.ts` (where records live), `idb-vault-db.ts` (the
    verbs), `bell.ts` (change notification) are the three places an author types;
    `expectations.ts` (the comparisons) is what they keep; `shelf.ts` holds the IndexedDB
    plumbing and `inOneTransaction`; `idb-opts.ts` the `dbName` parser. Tests path for path, and
    `TH.describeVaultDB` over the adapter. The README's *Writing an adapter of your own* is the
    KV sibling of #73's.
  - The core: `safebyok/idb` exports `idbDeviceDB` and `inspectIdbDeviceDB` only. The demo, the
    READMEs, `openVault`'s bad-`vaultDB` message, a changeset (`safebyok` and
    `safebyok-indexeddb` minor) and a `notes/security.md` entry follow.
* **Decisions taken**:
  - **Pulled forward, declared: the truly atomic `versionedUpdate` side quest** (TODO's *Side
    quests*, "IndexedDB `versionedUpdate` truly atomic"). Every write verb is one readwrite
    transaction: read, compare, write, through idb-keyval's `UseStore` and `promisifyRequest`
    (raw `IDBObjectStore` requests, so two keys are read in the transaction, which idb-keyval's
    `update()` cannot do). It came naturally with the move and makes this template read as the
    sibling of Postgres's "one statement per verb". **The orchestrator can strike that side
    quest from TODO.** Four race tests (two updates on one expectation, two creates, two first
    lockbox writes, an erase racing a write) fail against the old two-transaction adapter under
    fake-indexeddb, and pass here.
  - **The `dbName` parser is duplicated** into the package (`src/idb-opts.ts`), as a template
    should stand alone; the core keeps its own for `idbDeviceDB` and `browserOpts`, minus the
    shelf parser it no longer needs.
  - **`inspectIdb` split in two**: `inspectIdbDeviceDB` in the core, `inspectIdbVaultDB` in the
    package. Keeping `inspectIdb({ shelf: 'vault_db' })` in the core would have meant the core
    reading a layout another package owns. `IdbShelf` is gone. Same no-shim rule as `idbVaultDB`.
  - **Stored layout unchanged**: database `<dbName>:vault_db`, store `records`, the same ckeys
    and BroadcastChannel name, so a host's existing vaults read on (a test plants rows as the
    core wrote them). Records are stored as themselves, field by field, by structured clone.
  - **Expectations without zod**: strict equality on the standing row's fields against the
    already-validated expectation, the same outcomes as the core's `StandingBundle` schemas. The
    package still has `zod` as a peer, for `parseDbName`.
  - `idb-keyval` is a regular dependency, the same range as the core's, so it dedupes: not a new
    supply-chain entry for any host. `fake-indexeddb` is a development dependency.
* **Deviations** (fixes of the old adapter's behaviour, made in the new one):
  - A write that rings now opens the BroadcastChannel itself, so a tab that writes without
    subscribing still tells other tabs (the old bell only posted once something in the tab had
    subscribed).
  - Each listener is called on its own microtask: a throwing listener is reported as any
    uncaught error, and neither stops the others nor turns a landed write into
    `storage_unavailable` (the old bell called them synchronously inside the verb).
  - `inOneTransaction` aborts its transaction when its work throws, so a synchronous failure after
    a request was placed commits nothing (found by a test: a rejected `UseStore` callback alone
    leaves the placed requests to commit).
  - `vault-db.ts`: `bundleCkey`, `boxCkey`, `isBoxCkeyOf` and the three `*MeetsExpectation`
    helpers are no longer exported from their module (only `localVaultDB` uses them);
    `scopePath` stays, for the device store.
* **Discoveries**:
  - Thread 2 (#71) changes `TH.bundleOf`; nothing here names a bundle field beyond `vault_id` and
    `passphrase_epoch`, and the README's *What is stored* is worded to hold for either shape.
    Expect a one-line conflict with #73 in `.changeset/config.json`'s `fixed` group, and in the
    root README's package list.
  - The core's device-store bell still has both old bell behaviours (channel only once
    subscribed; listeners synchronous). Only `inspectIdbDeviceDB` listens to it, so it matters
    little; left alone.
  - The work inside `inOneTransaction` must await only IndexedDB requests: awaiting anything else
    lets the browser commit early. Its doc block and the security note say so.
  - No `size-limit` entry for the new package: the root `size` script builds only the core.
    Its built `index.js` is 15.5 kB, almost all doc comments.
  - CLAUDE.md's *Layout* still lists three packages; #73 did not add `safebyok-postgres` either.
    A sweep after both land.
* **Review** (`fixed`, two commits): the bell no longer calls a listener unsubscribed between
  the ring and its microtask (`997823f`; a closed vault met it as a failed refresh and a logged
  warning), and `vaultMeetsExpectation` also needs a finite `passphrase_epoch`, as the core's
  `StandingBundle` does (`eb0b3ce`). Left, minor, and in the PR's open questions:
  - the bell's BroadcastChannel is never closed or unref'd, so a Node or Bun process using the
    adapter stays alive (a platform call for the Coach);
  - a throwing listener, on its own microtask, crashes a Node process (`reportError` is an
    option where the platform has it);
  - the core's device-store bell keeps its old behaviours;
  - `listBoxes` and `eraseVault` read the whole store where a key range would do;
  - a failed write's `cause` can be null (IndexedDB's `request.error` on an abort);
  - the race tests share one connection, so they prove IndexedDB's serialization within one
    tab's connection, not across two.
* **For the Coach**:
  - The no-shim break: `safebyok/idb` stops exporting `idbVaultDB`, `inspectIdb` and `IdbShelf`.
    The changeset tells hosts the one import to change.
  - TODO's roadmap 3 bullet ("a decision on `safebyok/idb`") is settled by this PR: it moved
    before the release. TODO's two IndexedDB side quests can be struck.
