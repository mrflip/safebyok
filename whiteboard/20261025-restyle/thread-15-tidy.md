# Thread 15: Names and small rulings (2026-10-27)

Branch `20261027-tidy`, PR [#291](https://github.com/mrflip/safebyok/pull/291), on main (#286 and
#287 merged under it). Justify: green (core 3390 / 37 skipped, react 309, indexeddb 167, postgres
322, convex 350, graphql 344, demo 229, e2e 107, fastkey 49, root 265; every size budget on the
rule, none written).

* **Built**:
  * **Renames.** `useBankVault` → `useListedVault`. `StringStore.ckeys()` → `scopepaths()` (its
    parameters too; `fullCkey` → `prefixedScopepath`). `IdbRow.ckey` → `IdbRow.scopepath`, in both
    inspectors. `Gate.of(vaultRecord, kit)` (`Gate.make`'s second argument `given`, not `props`).
    Convex's `ListedBox` validator → `BoxSparse` (`listedOf` → `boxSparsesOf`); Postgres's
    `ListedBoxColumns` → `BoxSparseColumns`. `TH.madeUnderOf` → `TH.cheatGetVaultEpoch`.
  * **Lint**: `sonarjs/redundant-type-aliases` off in all ten configs; `LeaseSparse = LeaseStamp`.
  * **`vault.stamp`**: a prototype getter handing out the Vault object's own fields as one frozen
    plain object, the same each time. **`bank.vaults`, `bank.lifecycle`**: prototype getters on the
    current snapshot; the README's non-React text and the bank tests use them.
  * **The vault's private bundles**: `VaultPrivateTools` (`keyDeriver`, `leaseMillis`, `demand`),
    extended by `ProvingTools` and `GatingTools`; the Vault object builds the shared part once and
    spreads it into each hand-over.
  * **`src/helpers.ts`** (was `adorn.ts`): `adorn`, `decorate`, and the Coach's `nextMicrotask`,
    used for bank.ts's `await Promise.resolve()` in `#settleBirth`.
  * **VOCABULARY**: rows for lifecycle (and how it differs from freshness), the bank's listing and
    BankVault; a `scopepath` row, the `ckey` row now any map key (it cited the gone `Ckeys`); the
    *Made under* paragraph names `vault.stamp`.
  * **Leftovers**: `VaultReadResponse.vault` is `unknown`, every cast gone (local, IndexedDB,
    Postgres, tests); the core's `idbOpts` strict, the adapter's options extending it and reading
    its default (`Validators.idbOpts.parse({}).dbName`); the passphrase refusal's full stop (in
    gating.ts's `checkText`, the one a dialog shows); useVault's and useVaultSnapshot's examples
    and the README say a null is opening *or refused*; scopepath.ts's "props"; the format
    snapshot comment for pre-1.0; VAULTDB.md 4.7's sentence on rows the listing skips;
    documentarian.md's `bad_scope`; the doc blocks of `Validator` (a schema keyed by input repeats
    its keys, with a test; `VaultSparse.pick`), `Kit`, `ensureVault`, `StoredBox`,
    `key-deriver-spec-checks.ts`; `validator.ts`'s examples name shape validators in PascalCase.
  * `notes/security.md` amended by a sonnet subagent (the tools split, `vault.stamp`, the strict
    options, the unknown vault row).
* **Decisions taken**:
  * **`helpers.ts`, not `utils.ts`.** `src/utils.ts` is the `safebyok/utils` entry: anything in it
    is public there, and an internal file of that name would build to the entry's `dist/utils.js`.
  * **The bundles stay two, on a shared base.** Of 16 members, 3 are shared. Merged, the gating
    would gain `putLease`/`holdLease` (granting a lease) and provings `putGate`, `delVault`, `takeUp`.
  * **The getter is `vault.stamp`**: VOCABULARY says a Vault object's own fields are its stamp.
  * **`cheatGetVaultEpoch` returns the vault's sparse record** (stamp and both epochs), so the
    `Box.make(vault, record, ...)` sites keep one helper.
  * **The full stop is restored at the one sentence**, not by ending every Validator message
    with one: 16 tests and `optionsCheck`'s own `. ` join assume none.
  * **No TODO entry for async passphrase checking**: `StrengthChecker` may already answer a
    promise (`PassphraseVerdict | Promise<PassphraseVerdict>`).
* **The `ensure*` audit** (the Coach's question): `bank.ensureVault` (and private `#ensureEntry`)
  hands back the Vault object it holds, or joins the birth under way, reading nothing; it births
  only where none is held (never asked, let go, or refused). `vault.ensureUnlocked` resolves at once,
  writing nothing, under a lease that stands past `renewMinutes`; it says hello first, which reads
  storage only when the picture is older than `staleMinutes`: a check of the condition, not a
  change. `VaultDB.ensureVault` / `ensureVaultRecords` hand back a standing vault untouched.
  No other `ensure*` exists in the core or the packages. All idempotent: none renamed.
* **Deviations**:
  * Scope validators keep camelCase in `validator.ts`'s first example (`bankScope`, `vaultScope`),
    as the code's `CX.vaultScope` does; only the record and sparse validators became PascalCase.
  * NEWSTYLE lives in the sprint's worktree, which a thread does not write; STYLE.md on this branch
    has no spread example yet. The name for #272 to use there: `vault.stamp`.
* **Discoveries**:
  * "Listed" that is *not* the sparse shape, left: the core's `ListedBox` validator (a box whole
    *or* sparse, as an adapter may hand it up), `meta.box_listed` (a `BoxDamaged`) and
    `meta.wayin_listed` (a `WayinSummary`), the vault's private `#listed*` helpers and React's
    private `useListed` (membership in a listing), Postgres's SQL alias.
  * The demo files account rows in its `dbStore` under keys that are not scopepaths
    (`account:acme:margo`); its own `StoreRow` keeps `ckey`, mapped from `IdbRow.scopepath`.
  * `DamagedVaultRecord` is exported but no longer used inside the package.
  * vault.ts's *Demand* banner named a `gatedProps` that no longer exists: now `gatedRecord`.
* **For the Coach**: `helpers.ts` over `utils.ts`; the two bundles kept apart; `bank.lifecycle`
  without a `bank.err` (a refused bank's `err` is on the snapshot); the scope validators' case.
