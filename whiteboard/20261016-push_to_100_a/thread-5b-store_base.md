# Thread 5b: store_base (2026-10-17)

Branch `20261016-store_base`, PR [#139](https://github.com/mrflip/safebyok/pull/139), stacked on
#136 (line main → #128 → #133 → #127 → #132 → #137 → #136 → this), cut at `8439aa01`; to be
rebased onto thread 11's restacked tip by the filer. Built across two sessions (checkpoint
`3ef9fd97`, finished `de6315a8`). Justify green: core 1960, IDB 129, Postgres 247, GraphQL 237,
Convex 256, React 115, fastkey 44, demo 170, e2e 81, root 155.

* **Built**:
  - `VaultDB(opts?: VaultDBOpts)`: protected `logger` (own, else `adoptLogger`'s, else console),
    public `adoptLogger` (called by `openVault` only when the host passed a logger), a guarded
    `subscribe` (each listener's throw or rejection → `logger.error` + `reportError`; adapter
    unsubscribe once), concrete `listBoxRecords`, protected `watchTrouble` (warn once a streak).
  - Core modules `refusals.ts` (`Refusals`, never a null cause), `expectations.ts`,
    `change-bell.ts` (`ChangeBell`, from `safebyok/idb`; `idbDeviceDB` rings it), `report-error.ts`.
  - Every adapter factory takes one bag with `logger`: `localVaultDB({ store })`,
    `convexVaultDB({ client, api })`, `graphqlVaultDB({ client, maxLockboxes })`, `idbVaultDB`,
    `postgresVaultDB`. IDB's `bell.ts`/`expectations.ts` gone to core; Postgres and GraphQL
    default `maxLockboxes` to `Infinity` (Postgres sends SQL null and skips the count).
  - GraphQL: validation codes → `bad_option` (G303); a throwing `vaultDBFor` crosses as
    `bad_option` with a generic message, its own kept server-side as the cause (G304); a failed
    subscription warns and calls `onChange` (6.2).
  - Convex component `updateBundle` lands only a bundle keeping `vault_id` with a higher
    `unlock_epoch` (G247); a failing `ConvexClient` watch warns once a streak.
  - Tests: Postgres listen/unlisten failures reach the logger; Convex streak warnings; G303's
    two codes; `idbDeviceDB` rings another tab with none here listening; battery line 1.1 now
    proves a stray field is left behind, over every adapter; a test pins `convex` at 1.46.
  - Trims: Convex per-verb `identity_revoked` loops folded to one verb each (package and e2e),
    "hears nothing once unsubscribed" and "leaves another user's vault" dropped (battery 6.1,
    5.4), component groups repeating 1.1-3.8 dropped; Postgres's three cap tests dropped (named
    as 4.3/4.4 in a comment) and its `kind as 'vault_full'` cast gone.
  - Docs: VAULTDB.md *Who does what* (subscribe guard, `listBoxRecords`, logger) and 5.4's
    identity-seam sentence; IDB, Postgres, GraphQL and Convex READMEs; comments at `placeholderOf`,
    `BoxRevision`, `watchVault`. Six `notes/security.md` entries; changeset extended.

* **Decisions taken**:
  - `adoptLogger` public; a VaultDB made with its own logger keeps it.
  - `ChangeBell` keyed by bell name, so each store keeps its stored channel name.
  - `Refusals.notPermitted`/`vaultFull` take `ErrorOptions`: a cause left out leaves none.
  - G149's double parse kept: names checked before the record, so a refusal says `bad_label`.
  - A Postgres `listen` that throws is `storage_unavailable` at subscribe; one that rejects is warned.
  - G304: *anything* `vaultDBFor` throws is `bad_option`, a VaultError of another kind included;
    the docs tell hosts to let the VaultDB, not `vaultDBFor`, refuse a signed-out request.
  - `settle` now rejects with the browser's null where it gave no error; the base makes it an
    Error. The message a host sees changed (changeset says so).
  - G292's "miss reasons computed on a landed write" kept: three index probes in the one
    statement; computing them only on a miss buys nothing measured.

* **Deviations**: `bindValidators` and ShelfVaultDB dropped (Coach). One
  `eslint-disable-next-line @typescript-eslint/no-misused-promises` in `tests/test-helpers.ts`,
  one in `tests/vault-db.test.ts`, and one `only-throw-error` there: an async or throwing host
  listener is the case under test. The "leaky unsubscribe" battery test wraps a VaultDB in a
  Proxy, since the base class no longer lets an adapter leak. The preplan's acceptance "every
  in-tree adapter is shorter" holds for IDB (src 530 → 364) and Postgres (726 → 683) but not
  GraphQL (761 → 789: G303, G304, 6.2, logger, as the design's Risks foresaw) nor Convex
  (1454 → 1472, mostly doc comments for G248/G254/G250 and G247); Convex's tests shrank 1757 → 1597.

* **Discoveries**: a package's tests resolve sibling packages through `dist/`: run
  `pnpm --filter safebyok build` after changing core. The e2e Convex file copies the package's
  `ClientCases` loops; a trim there is made in both. `oneAtATime`'s `begin` and `vault-db.ts`'s
  `soon` left as they were. Bumping `convex` now fails `tests/testing.test.ts` on purpose.

* **Size** (`pnpm size`, `.size-limit.json` untouched; base at `8439aa01` in brackets): `openVault`
  26.23 kB [25.75] of 30; everything 33.76 kB [32.94] of 40; `idbDeviceDB` 12.35 kB [12.23] of
  15. All inside budget.

* **Rows** (34), all **closed**:
  G207, G208, G209, G210, G211 (base class, logger, guarded subscribe, `listBoxRecords`);
  G213 (`Refusals`, `settle`'s fallback retired); G214 (only `doSubscribe` defaults, unchanged);
  G270 (`idbDeviceDB` rings `ChangeBell`, tested); G149 (one `checked()`, double parse kept as
  above); G511; G285 (`Infinity` defaults, no count); G303 (tested); G304 (resolvers, tested);
  G305 (GraphQL README: non-null fields, Postgres rules it out); G247 (component, tested);
  G257 (Convex drops every cause); G240 (trims above; `pushes`/`makeVaultDBFor` were already
  passed); G519 (three cap tests, named 4.3/4.4); G523 (capped factories get `listen`;
  `MapVaultDB` counts through ckeys; battery 1.1 stray-field line); G268 (`idb.ts` doc);
  G286 (Postgres README: PGlite + `VaultTablesSql` is the test backend); G300 (GraphQL README:
  opaque JSON by choice); G272 (`localVaultDB` "one tab"); G491 (core doc, IDB README);
  G258, G252, G246 (Convex README); G236 (once-guard to the base); G233 (VAULTDB.md 5.4);
  G248 (`watchVault` comment, README); G254 (`BoxRevision` comment); G250 (version-pin test);
  G290 (`placeholderOf` comment); G292 (README listen and cost lines, cast gone; miss reasons
  kept as above).

* **For the Coach** (the first three are already rows in the sprint doc):
  - *adoptLogger is public surface*: Rec keep (a host composing its own entry point needs it).
  - *A shared VaultDB keeps the latest logger handed it*: Rec accept; documented.
  - *Errors reported twice in browsers* (logger and `reportError`): Rec accept, as designed.
  - New: *GraphQL and Convex sources grew* against the "every adapter shorter" acceptance line
    (see Deviations): Rec accept, the growth is the rows' own behaviour and its documentation.
