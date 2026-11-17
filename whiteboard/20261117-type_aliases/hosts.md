# Thread: type aliases in the adapters and safebyok-react (2026-11-17)

Branch `20261117-type_aliases_hosts`, stacked on #720 (`20261117-type_aliases_big`), outside any sprint. Proved: `pnpm --filter <pkg> typecheck` and `lint` per package as built; `pnpm justify` result in the PR.

* **Built**: big's plain aliases used in hand-written signatures, type literals, `Map` keys, and test helpers' signatures. Type spelling only: no runtime, validator, SQL or stored-shape change.
  * `safebyok-indexeddb`: the scopepath tuples and `lifeRangeOf`/`boxPlaceOf` (`UserID`, `Banklabel`, `Vaultlabel`, `Boxlabel`, `BankTok`, `VaultTok`); `Rung` and the `Map<Vaultlabel, ...>` in `idb-bank-db.ts`. About 20 sites.
  * `safebyok-postgres`: `bankChannelOf`, `channelOf` (`UserID`), the `Told` notice type (labels and toks); test helpers' tok and boxlabel parameters. About 12 sites.
  * `safebyok-convex`: `GetUserId` (`UserID`), the component's `Life`, `getBoxDoc`, `liveBankTokOf`, `RowsWatched`, the watch's box list; tests. About 14 sites.
  * `safebyok-graphql`: `getUserId`, `signInRefusalOf`, `serveSignedIn`, the watch's `vaultlabel`, the `SafebyokEpochMillis` scalar (`EpochMillis`); test helpers and recipe. About 16 sites.
  * `safebyok-react`: `BankProviderProps.user_id`, `ProviderDeviceOpts`, `CreateVaultButtonProps`, `DevBoxInspectorProps`, `useVault`/`useBox`/`useBoxes`/`useVaultSnapshot`, `Messages.passphraseUsername`, `timeOf`, the dev box inspector, `watchedLives` (`VaultTok`); tests. About 22 sites.
  * `safebyok-fastkey`: nothing to name (passphrase, salt bytes, spec).
* **`as const satisfies`**: `Doing` (react `helpers/messages.ts`, internal) and the postgres vault test's `ThingTables`. Already so: postgres `vault-queries.ts` `ThingTables`.
* **Left, with reason**: postgres `GetThingSql`, `ListThingsSql`, `WriteThingSql` (annotated `Readonly<Record<Thingkind, string>>`; exported, and narrowing SQL text to literals buys nothing); postgres `VaultFunctionNames` (a cast over `Object.fromEntries`, no literal); react `DialogForGatingkind` (a mapped type that ties each component to its kind, which `satisfies` would not keep); `LeaseColumns` (no known key set, rows are `Record<string, unknown>`); graphql `BankOperations` (no key type).
* **No alias of a package's own**: none met the bar. `gatelabel` stays `string` (big rejected `Gatelabel`).
* **Decisions made**: the aliases come from `safebyok-big` (the public entry), as a separate `import type`, in each adapter, including the storage adapters that otherwise import `safebyok-big/storage`: the published declarations then name a public module. The storage `Told`, `Life` and `RowsWatched` literals take them too. GraphQL SDL strings and `$user_id: String!` operations are schema, not types, and stay.
* **Left for later**: `safebyok-postgres/src/postgres-vault-db.ts` (`thingsChannelOf(userid: string)`, `Told.labelpath`) speaks the new core's vocabulary (`userid`, `labelpath`); the lean thread (`20261117-type_aliases_lean`) owns its aliases. Once that merges, retype these there.
* **Excluded**: `safebyok-react/tests/test-helpers.ts` and `package.json` untouched, per the handoff. `test-helpers.ts` spells no bare string or number for these names, so nothing there awaits a change.
