# Thread 8: Checkers once (2026-11-06)

Branch `20261106-checkers_once`, PR pending, stacked on #552. Justify: not yet run.

* **Built** (one commit per row):
  - The scopes have one home, `shapes-core` (`CX`, 'bad_scope', frozen). `shapes-storage` no longer
    exports `bankScope`, `vaultScope`, `boxscope` or their types; it extends CX's through
    `.unwrap()` (a readonly schema has no `.extend`). A VaultDB's `listVaults`, `getVault` and
    `tidyGone` now refuse a bad scope 'bad_scope' where they said 'bad_option'.
  - `SX.LeaseSparse` (the deviceDB's scope, `vault_tok`, `proved_at`) is now `LeaseDated`;
    `LeaseSparse` names only the lease's sparse shape (`GX.LeaseSparse = LeaseStamp`).
  - `SX.leaseQuery` is `SX.vaultQuery` under the lease's name; `leaseDated` extends it.
  - The VaultDB and DeviceDB ducks are brands: `IsVaultDB`, `IsDeviceDB` (`Symbol.for`) in
    helpers/consts.ts, a getter on each base class; `VX.brandedVaultDB`, `VX.brandedDeviceDB`
    replace `vaultDBDuck`, `deviceDBDuck`.
* **Rows not yet done**: the directives (logger brand, host functions parsed twice,
  `tryCheckStrength`), the cleanup (ShapeModules check, `KX` row), the remade shapes
  (`GX.vaultStamp`, `SX.reqParams`, `putListingOpts`/`putIfAbsent`, the durations), the
  repeated defaults.
* **Decisions taken**: `LeaseDated` for the renamed shape (VOCABULARY has no shape name for "a
  row's query plus its date"); the brand getters carry `eslint-disable-line
  @typescript-eslint/class-literal-property-style`, as ground rule 12 wants a getter where the
  lint wants a readonly field.
