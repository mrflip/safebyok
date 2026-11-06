# Thread 8: Checkers once (2026-11-06)

Branch `20261106-checkers_once`, PR #553, stacked on #552. Justify: green (safebyok 2215 tests;
every package green; lint 0 errors).

* **Built** (one commit per row, every row of the gloss):
  - Scopes have one home, `shapes-core` (`CX`, 'bad_scope', frozen). `shapes-storage` extends
    CX's through `.unwrap()` (a readonly schema has no `.extend`). A VaultDB's `listVaults`,
    `getVault` and `tidyGone` refuse a bad scope 'bad_scope' where they said 'bad_option'.
  - `SX.LeaseSparse` (the deviceDB's query plus `proved_at`) is now `LeaseDated`; `leaseQuery` is
    the `vaultQuery`, and `leaseDated` extends it.
  - VaultDB and DeviceDB ducks are brands: `IsVaultDB`, `IsDeviceDB` (`Symbol.for`, helpers/consts),
    a getter on each base class; `VX.brandedVaultDB`, `VX.brandedDeviceDB`.
  - Directive 1: a bank's world and a lease's friend check the logger by the guard's brand
    (`isGuardedLogger`, logger.ts), not `loggerShape`. Fake worlds in tests pass `parseLogger(...)`.
  - Directive 2: `VX.bankOpts` only names `keyDeriver`, `requestCleartext`, `strengthChecker`,
    `logger` and `onPanic` (`custom<T>()`, unchecked); each guard is the one check, and its parse
    passes `{ where: '<option>' }` so the refusal still leads with the option's name.
    `Phrases.StrengthCheckerShape` lost its lowercase lead and trailing period to fit.
  - Directive 3: the `StrengthChecker` doc block and CUSTOMIZATION.md name
    `gating.checkStrength(typed)`, which answers a verdict.
  - Cleanup: the values sweep (`tests/helpers/validator.test.ts`) takes PX and UX too, and a test
    imports each file in `src/shapes/` and finds it on the list; STYLE.md's table names `KX`.
  - Remade shapes: `GX.vaultStamp` spreads `CX.vaultScope.unwrap().shape`; `SX.reqParams`
    extends `boxQuery`; `VX.putListingOpts` is gone, `listing.put` takes `SX.putOpts`.
  - Repeated defaults: `VX.fetchOpts` defaults `ifAbsent` 'fail', `VX.boxPutOpts` 'add' and
    'repl'; the four destructure defaults are deleted. `FetchOpts`, `BoxPutOpts` are now
    `Z.input` (the same fields a caller may leave out).
  - Durations: `GX.leaseMillis` refuses Infinity (`int.positive().max(ForeverMillis)`); the
    bank's `millisOf` and `VX.horizonMillis` bound a host's Infinity to `ForeverMillis`, as
    `SX.capacity` bounds a storage's to MAX_SAFE_INTEGER.
* **Decisions taken**:
  - Directive 2 dropped `bankOpts`' checks, not `HostChecks`: dropping `HostChecks` would leave the
    exported guards unchecked and `keyDeriver`/`strengthChecker` still checked twice.
  - `LeaseDated` for the renamed shape (VOCABULARY has no name for "a row's query plus its date").
  - The brand getters carry `eslint-disable-line @typescript-eslint/class-literal-property-style`
    (vault-db-new.ts, device-db-new.ts): ground rule 12 wants a getter where the lint wants a field.
  - `ForeverMillis` as the bound: it already said "the longest span between two instants the
    package accepts", and was unused in src.
  - Changeset `minor`: `bank.leaseMillis`/`autolockMinutes` read `ForeverMillis` for an
    `Infinity` autolock, and the host-function refusals end in a period.
* **Deviations**: the minute checkers (`positiveMinutes`, `refreshMinutes`) keep their own
  `union([..., lit(Infinity)])`: they are host vocabulary at the door, positive vs nonnegative,
  and STYLE allows Infinity there. Folding them into one would be machinery.
* **Discoveries** (the second survey the Coach asked for; none acted on):
  - VX re-exports SX names as they are (`VoidRevisionSeq`, `BoxFormat`, `boxRecord`,
    `VaultFormat`, `vaultRecord`, types `Times`, `BoxRecord`, `VaultRecord`), and re-kinds others
    under the same name (`am`, `revision`, `times`, `vaulted`, `sparseBase`, `boxSparse`,
    `vaultSparse`, `vaultRow` via `refusingAs`): one definition, two import paths.
  - GX re-exports `SX.passphraseWayin`/`passkeyWayin` as `passphraseWayinRecord`/`passkeyWayinRecord`.
  - `maxMillisSinceRefresh` is checked in `listingOpts` and again in `storableOpts`.
  - Bank's constructor parses `bankOpts` and discards the result, destructuring the raw opts.
  - `safebyok-react` still cites `vault.tryCheckStrength`; it runs on safebyok-old, which has it.
* **For the Coach**: whether `bank.autolockMinutes` should read `ForeverMillis / MinuteMillis`
  (now) or `Infinity` for a host's never; the two `eslint-disable-line`s above.
