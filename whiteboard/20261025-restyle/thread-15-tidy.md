# Thread 15: Names and small rulings (2026-10-27)

Branch `20261027-tidy`, stacked on [#287](https://github.com/mrflip/safebyok/pull/287) (main →
#286 → #287 → this). Justify: green at milestone 1 (core 3385 / 37 skipped, every package).

* **Built** (milestone 1, the renames):
  * `sonarjs/redundant-type-aliases` off in all ten eslint configs; `LeaseSparse = LeaseStamp`.
  * `vault.stamp`: a prototype getter handing out the Vault object's own fields as one frozen plain
    object, the same each time (vault.ts, *Vault: fields*).
  * `TH.cheatGetVaultEpoch(vault)` replaces `TH.madeUnderOf(vault)`: the vault record held but its
    gate, read through `vaultRecordHeldBy`, which tests no longer call.
  * "Listed" → "sparse" where it is the sparse shape: Convex's `ListedBox` validator is `BoxSparse`
    (`listedOf` → `boxSparsesOf`); Postgres's `ListedBoxColumns` is `BoxSparseColumns`.
  * `Gate.of(vaultRecord, kit)`; `Gate.make`'s second argument is `given`, not `props`.
  * `ProvingInside` / `GatingInside` → `VaultPrivateTools` (what both get: `keyDeriver`,
    `leaseMillis`, `demand`), extended by `ProvingTools` and `GatingTools`; the Vault object builds
    the shared part once and spreads it into each hand-over.
  * `src/adorn.ts` → `src/helpers.ts`, with `nextMicrotask()`, used in bank.ts's `#settleBirth`.
  * `useBankVault` → `useListedVault`. `StringStore.ckeys()` → `scopepaths()` (and its parameters,
    `fullCkey` → `prefixedScopepath`); `IdbRow.ckey` → `IdbRow.scopepath`, in both inspectors.
  * `checks/validator.ts`: its `@example` blocks (and the test mirroring them) name shape
    validators in PascalCase; a paragraph that a schema keyed by input repeats its keys (with a
    test), and `Kit`'s doc gives instructions.
* **Decisions taken**:
  * **`helpers.ts`, not `utils.ts`.** `src/utils.ts` is the `safebyok/utils` entry point: anything
    in it is public on that entry, and an internal file of that name would build to the entry's own
    `dist/utils.js`. So the Coach's "utils.ts" is `helpers.ts`, internal.
  * **Two tool bundles kept apart, sharing a base.** Of 16 members, 3 are shared. A merged bundle
    would hand the gating `putLease`/`holdLease` (granting a lease) and the provings `putGate`,
    `delVault` and `takeUp`: the non-incidental difference the Coach named.
  * **The getter is `vault.stamp`**: VOCABULARY says a Vault object's own fields are its stamp.
  * **`cheatGetVaultEpoch` returns the vault's sparse record** (its stamp and both epochs), so the
    `Box.make(vault, record, ...)` sites keep one helper.
* **Deviations**: none yet.
* **Discoveries**:
  * "Listed" that is *not* the sparse shape, left: the core's `ListedBox` validator (a box whole
    *or* sparse, what an adapter may hand up), `meta.box_listed` (a `BoxDamaged`) and
    `meta.wayin_listed` (a `WayinSummary`), the vault's private `#listed*` helpers and React's
    private `useListed` (membership in a listing), and Postgres's SQL alias.
  * The demo stores account rows in its `dbStore` under keys that are not scopepaths
    (`account:acme:margo`): `StringStore` is named for its library use; the demo's own `StoreRow`
    keeps `ckey`.
  * `notes/security.md` names `ProvingInside`: to be amended (a sonnet subagent) at the last
    milestone.
* **For the Coach**: `helpers.ts` over `utils.ts`; the two tool bundles kept apart.
