# Thread 18: VaultDB names (2026-11-07)

Branch `20261107-vaultdb_names`, PR #593, stacked on #589 (thread 16), which stands on #586.
Justify: green; safebyok 2473 tests, graphql 235 (+3 skipped), indexeddb 110, postgres 123,
convex 227, react 205, e2e 298, demo 60; lint 0 errors.

* **Built**:
  * `packages/safebyok/src/storage/vault-db-new.ts` is `vault-db.ts`, `device-db-new.ts` is
    `device-db.ts`, and their tests `tests/storage/vault-db.test.ts`, `device-db.test.ts`. Every
    import followed, `notes/guarantees.md` and `notes/gallant-docblocks.md` included.
  * The base class the adapters extend (`MemoryVaultDB`, `IdbVaultDB`, `PostgresVaultDB`,
    `ConvexVaultDB`) is `AdapterVaultDB`; the interface a bank takes, once `VaultDBVerbs`, is
    `VaultDB`. `GraphQLVaultDB implements VaultDB`. The front door exports the types
    `AdapterVaultDB` and `VaultDB`; `safebyok/storage` exports the class and the type.
  * `VaultDBOpts` / `vaultDBOpts`, the base's constructor options, are `AdapterVaultDBOpts` /
    `adapterVaultDBOpts`, and the subclasses' `...vaultDBOpts` locals follow.
  * Brands (`helpers/consts.ts`): `IsVaultDB` is unchanged, answered by `AdapterVaultDB` and
    `GraphQLVaultDB`. New `IsAdapterVaultDB = Symbol.for('@safebyok/adaptervaultdb')`, a getter
    on `AdapterVaultDB` alone, with guard `isAdapterVaultDB`. `safebyok/storage` exports
    `IsAdapterVaultDB`, `IsVaultDB`, `isAdapterVaultDB`, `isVaultDB` (the guards were exported
    nowhere before).
  * `safebyok-graphql`'s `vaultResolvers` checks its `vaultDB` option with
    `DB.isAdapterVaultDB` in place of `instanceof DB.VaultDB`.
  * Tests: `tests/helpers/consts.test.ts` (a MemoryVaultDB is both; a stand-in client with only
    the IsVaultDB brand is a VaultDB and no AdapterVaultDB; a plain object of every verb is
    neither); `safebyok-graphql/tests/graphql-vault-db.test.ts` (a real GraphQLVaultDB is a
    VaultDB, not an AdapterVaultDB); `vault-resolvers.test.ts` (vaultResolvers refuses a
    GraphQLVaultDB, `bad_option`).
  * Ride-alongs: `idb-shelf.ts`'s `dbstem` doc names `device`, `bank` or `vaults`; the unused
    `eslint-disable-line @typescript-eslint/class-literal-property-style` on `DeviceDB`'s
    `IsDeviceDB` getter is gone (lint flagged it unused).
  * Prose: VOCABULARY.md's vaultDB row names `AdapterVaultDB` and the `GraphQLVaultDB` case;
    `safebyok-indexeddb/README.md` says extend `AdapterVaultDB`; the adapters' section banners
    and the indexeddb/postgres tsdown comments name `AdapterVaultDB`. `notes/security.md` was
    brought up to date by a `sonnet` subagent (11 lines, names and paths only).
  * Five changesets, one per published package changed (`safebyok`, `-indexeddb`, `-postgres`,
    `-convex`, `-graphql`), all minor.

* **Decisions taken**:
  * `brandedVaultDB` (shapes-vaultish) keeps checking the `IsVaultDB` brand *and* every verb, not
    the brand alone as `brandedDeviceDB` does: `vault-db.test.ts` holds it to refusing a branded
    object whose `watch` is no function, and `Symbol.for` lets any object wear the brand. The
    private `isVaultDBVerbs` would have collided with consts' `isVaultDB` once the interface
    took the name, so it became `answersEachVerb(val)` (after consts' `answersTrueTo`), and
    the check reads `isVaultDB(val) && answersEachVerb(val)`.
  * The `IsAdapterVaultDB` brand is checked where a store *must* be an adapter's: vaultResolvers.
    The models still take any `VaultDB` (`brandedVaultDB`).
  * `Phrases.VaultDBShape` (unused) now says "an instance of the AdapterVaultDB class"; its name
    stays. `Phrases.VaultDBExpected` drops "branded by safebyok's VaultDB" for "branded by
    safebyok", the brand being on both classes.
  * Prose left as is where "VaultDB" means the contract or a store in general: "the battery every
    VaultDB runs", STYLE.md, TODO.md, the design notes, README's backend list.

* **Discoveries**: `safebyok-react/src/devmode/` on #590 names `VaultDBVerbs`; it meets the
  rename at the restack (expected). `safebyok/README.md`'s "Nothing in the core exports a
  `VaultDB`" was stale before this thread; untouched.
