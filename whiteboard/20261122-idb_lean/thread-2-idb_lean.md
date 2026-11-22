# Thread 2: idb_lean (2026-11-22)

Branch `20261122-idb_lean`, PR [#829](https://github.com/mrflip/safebyok/pull/829), cut from `origin/main` (not stacked). Proved: `pnpm --filter safebyok-idb-lean`
lint, typecheck, test (116 tests: the vaultDB battery's 85-odd cases, 20 IdbVaultDB cases, 11 bridge cases), build;
`safebyok`'s index test and typecheck with its forgotten-exports check; `pnpm justify` green at dbd892e77, and again at the tip after the forward-only rework (see the last bullet of Decisions).

* **Built**:
  - `packages/safebyok-idb-lean`, private at 0.0.0, `safebyok: workspace:*` as a dependency (react-lean's pattern), out
    of the changeset `fixed` group. Packaging copied from `safebyok-indexeddb` (eslint, tsconfig, tsdown, vitest on
    fake-indexeddb). Dependencies: `safebyok`, `idb-keyval` (already big's and the old adapter's), `es-toolkit` (`noop`).
  - `IdbVaultDB` (`src/idb-vault-db.ts`, `src/vault-shelf.ts`): `AdapterVaultDB` over one object store `things` in
    `safebyok[-<dbName>]:vault-v001-001-001`, each Thing at `[userid, banklabel, labelpath]`. Follows `MemoryVaultDB`
    method for method; each `do*` is one `inOneStep` transaction that fetches the Thing, the bank, main gate and root
    box, classifies, and on a write act puts and reads back with the world after. A listing reads the key range
    `[u, b, L + '/']` to `[u, b, L + '0')` and keeps one level. Watch: a BroadcastChannel `safebyok[-<dbName>]:vault`,
    rung after commit with `{ scope, received: { record, world } }`, filtered by bank.
  - `IdbVaultDB.overwriteThing(record)`: `ThingChecks.thingScope` then `ThingkindChecks.ofLabelpath(...).record`, then
    one readwrite transaction that reads the Thing stored at the key and puts the record only where the stored Thing is
    absent, fails its kind's `stored` check, or `Thing.cmp(stored, record) > 0` (record newer). An older record or one
    at the stored revision is ignored, silently. No cite, no classify, no ring. Takes `ThingRecord | Tombstone<ThingRecord>`,
    what an item event holds.
  - `IdbMinderBridge` (`src/idb-minder-bridge.ts`): `make({ minder, idbVaultDB, onBadNews? })`, `hello` (idempotent),
    `goodbye`. Copies an item `updated`/`success` whose `state.data` is not undefined or the shell. Every throw and every
    refused overwrite goes to `onBadNews` through `storageRefusalOf`.
  - `safebyok/storage` now re-exports `dbprefixOf`, `inOneStep`, `rowAt`, `versionedShelfOf`, `VersionedShelfSpec` and
    `storageRefusalOf` from `safebyok-big/storage` (tests/index.test.ts checks they are the same bindings).
  - Tests: `tests/idb-vault-db.test.ts` (battery, options, databases, other tab's watch, overwriteThing, refusals),
    `tests/idb-minder-bridge.test.ts`; helpers behind `tests/test-helpers.ts` (`idb-world.ts`, `minder-world.ts`).
  - `notes/wontfix.md`: a bank born again under the same scope (lifetok under-used). `notes/security.md`: one entry, by a sonnet subagent.
* **Decisions made**:
  - The Coach's ruling (2026-11-22) on the noun "store" in vaultDB comments: swept in this package. Two comments changed
    (tsconfig.json header, the `overwriteThing` transaction comment); the rest are the verb, the browser's own "object store",
    or a backticked `store` parameter name, and stay.
  - Re-exported big's IndexedDB helpers from `safebyok/storage`, not `safebyok/browser`: storage.ts already re-exports
    from big's storage barrel, so it adds no new import to the entry, and it is "what a storage adapter is written
    against". `browser` would have kept idb-keyval names off the storage entry's surface; set aside as no real saving.
  - `new IdbVaultDB(opts)` with no `idbVaultDB()` factory, like `MemoryVaultDB`. No `maxBoxes` or size option: the
    new core's AdapterVaultDB has none.
  - The make arguments are checked by `instanceof ThingMinder` and `instanceof IdbVaultDB`, as `Vault.make` checks its
    minder. Two phrases in a package-local `src/phrases.ts`.
  - The bridge's order rests on `inOneStep` creating its transaction synchronously (idb-keyval's store awaits one shared
    promise), so overwrites run in call order; a `//` comment on `overwriteThing` says so.
  - Forward-only (the Coach, 2026-11-22: "forward-only, using .cmp -- lifepath, revseq; the scope is userid, banklabel, so
    only one exists"). The key stays `[userid, banklabel, labelpath]`, no lifetok read. A stored row that fails its kind's
    `stored` check is overwritten: the copy is never the ground truth, and the record in hand has passed its own check, so
    refusing would leave a damaged row in place for good. Absent and damaged take one path, `stored.safeParse` failing.
    Set aside: refusing the record when the stored row is damaged (the bridge would report bad news on every later copy).
    The row's own scope is not checked against its key (`parseConsistent`); a row filed at another scope compares by
    its lifepath and revseq all the same, which is a damaged-store case no copy depends on.
  - Name: `overwriteThing` writes only where newer; `landThing` and `copyNewerThing` were proposed. The Coach ruled the
    name `overwriteThing` stays.
* **Deviations**: none from the handoff. The old package's tests I did not port: tidyGone, maxBoxes, the database wipe
  and the absent-IndexedDB cases (no tidy or cap here; the wipe and the absent cases are big's `versionedShelfOf` and
  `inOneStep`, tested in big).
* **Discoveries**:
  - An item event's `state.data` is typed `RecordOfKind | Tombstone<RecordOfKind>`, and `Tombstone<T>` admits a sparse
    with `am: 'x'`, so it is not assignable to `ThingRecord`; hence the overwrite's parameter type.
  - The core's eslint turns `unicorn/prefer-combined-guards` off; the copied adapter config keeps it on.
  - What the bridge's listener could throw is untestable from outside (nothing in it throws); the catch is there as the
    handoff asks.
* **For the Coach**: nothing blocking. The security entry names the branch, not PR #829.
