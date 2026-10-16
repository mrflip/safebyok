# Thread 5b: store_base (2026-10-16)

Branch `20261016-store_base`, PR [#139](https://github.com/mrflip/safebyok/pull/139), stacked on
#136 (line main → #128 → #133 → #127 → #132 → #137 → #136 → this). **Checkpoint**, not ready:
the session hit its limit. Justify: green at `3ef9fd97` (core 1954, IDB 128, Postgres 248,
GraphQL 232, Convex 291, React 115, demo 169, e2e 95, root 155).

A fresh worker resumes from this worktree (`/workspace/byok-store_base`) or the branch. Read
`store-base-design.md` and the plan's thread 5 gloss (the Coach's comments) first.

* **Built** (commit `3ef9fd97`):
  - `VaultDB(opts?: VaultDBOpts)`: protected `logger` (own, else `adoptLogger`'s, else console),
    public `adoptLogger`, guarded `subscribe` (try/catch and rejection catch per listener →
    `logger.error` + `reportToPlatform`; `live` flag; unsubscribe once; a throwing adapter
    unsubscribe logged), concrete `listBoxRecords`, protected `watchTrouble(message)` (warn once
    per failing streak). `openVault` calls `adoptLogger` only when the host passed a logger.
  - New core modules: `src/refusals.ts` (`Refusals`), `src/expectations.ts` (`Expectations`),
    `src/change-bell.ts` (`ChangeBell`, exported from `safebyok/idb`; `idbDeviceDB` rings it,
    G270), `src/report-error.ts` (`reportToPlatform`). `asError` moved to `logger.ts`;
    `Names.sameScope` replaces `vault.ts`'s `isOfScope` and `checkBundle`'s compare; one
    `checked()` behind `checkOutgoing`/`checkRecord` (G149).
  - `localVaultDB({ store, logger })`, its options checked, its doc saying "one tab" (G272) and
    the quota refusal (G491). `makeBell` catches per listener.
  - IndexedDB: `bell.ts` and `expectations.ts` deleted (their tests moved to core's
    `change-bell.test.ts` and `expectations.test.ts`, thread 13's epoch rows kept);
    `idbVaultDB({ dbName, logger })`; `bellnameOf` in `idb-opts.ts`.
  - Postgres: own `listBoxRecords`, `heldScope`, `listening` guard and `PostgresVaultDB` type gone;
    `logger`; failed `listen` warned via `watchTrouble`, failed unlisten logged; `maxLockboxes`
    default `Infinity`, sent as SQL null, the count skipped by a CASE (G285); `vault_full` from
    `Refusals.vaultFull`; capped battery factory has `listen` (G523).
  - GraphQL: `graphqlVaultDB({ client, maxLockboxes, logger })`, default `Infinity`;
    subscription error → warn + `onChange` (6.2); `BAD_USER_INPUT`/`GRAPHQL_VALIDATION_FAILED` →
    `bad_option` via the Sanitizer (G303); `ServedVaultDB` is a `Pick` of `VaultDB`;
    `Refusals.storageUnavailable` at the wire.
  - Convex: `convexVaultDB({ client, api, logger })`; once-guard gone to the base (G236);
    `ConvexClient` `onError` warned via `watchTrouble`; own refusals through
    `Sanitizer.refusalFor`, no cause (G257).
  - Battery: factories take `VaultDBOpts` (`TH.MakeVaultDB`); `listBoxRecords` in
    `VaultDBVerbs` and `perUser`; new 2.3 test (`listBoxRecords`) and 6.1 check
    `push_past_a_failing_listener`.
  - Changeset `.changeset/20261016-store_base.md` (minor, five packages).

* **Left, in order:**
  1. GraphQL G304: a `bad_option` thrown by `vaultDBFor` crosses with a generic message, the
     original as the server-side cause (resolvers' `served` and `subscribe`), with tests.
  2. Convex component G247: `updateBundle` lands only when `bundle.vault_id ===
     standing.vault_id` and `bundle.unlock_epoch > standing.unlock_epoch`, else `false`; tests in
     `tests/component/vaults.test.ts`.
  3. Tests still owed: Postgres rejected `listen` reaches the logger; Convex `onError` logged once
     per streak; GraphQL G303 mapping; `ChangeBell` from `idbDeviceDB` rings other tabs with no
     listener (G270).
  4. Test trims: Convex G240 (per-verb `identity_revoked` loops to one, "hears nothing once
     unsubscribed", "leaves another user's vault", component groups repeating 1.1-3.5); G250 a
     test pinning the `convex` version the fake socket follows; Postgres G519 (three cap tests,
     naming lines 4.3/4.4) and G292's `kind as 'vault_full'` cast.
  5. `safebyok-indexeddb/src/shelf.ts` `settle`: drop its null-replacement fallback, now the
     base's (`Refusals.storageUnavailable`); adjust `shelf.test.ts`.
  6. Doc lines: VAULTDB.md *Who does what* (subscribe guard, `listBoxRecords`, logger) and 5.4's
     identity sentence (G233); IDB README (template no longer copies `bell.ts`/`expectations.ts`:
     use `Expectations` and `ChangeBell`; G491 quota line); Postgres README (G286 PGlite and
     `VaultTablesSql`; G292 listen-silent and the cost line, now true; G290 comment on
     `placeholderOf`); GraphQL README (G300 opaque JSON, G305 non-null fields); Convex README and
     comments (G246, G248, G252, G254, G258); core README's `localVaultDB` examples (check).
  7. `notes/security.md` (append, dated): `reportError` gets host listener errors as-is; the
     adapter keeps its own logger over openVault's; Convex drops every cause; GraphQL validation
     errors cross with no server text.
  8. `pnpm size` measure vs base (`openVault` 25_751, everything 32_939, idbDeviceDB 12_230 at
     base); do not edit `.size-limit.json`.
  9. Row report below completed; PR body; then `ready`.

* **Decisions taken**:
  - `openVault` → adapter logger via a public `VaultDB.adoptLogger`, called only when the host
    passed `logger`; a VaultDB made with its own keeps it. About ten lines: built, no TODO needed.
  - `ChangeBell` keyed by bell (channel) name, so each store keeps its stored channel name.
  - `Refusals.notPermitted(message?, opts?)`, `vaultFull(limit?, opts?)` take `ErrorOptions`, so
    a cause left out leaves none, and one given null becomes an Error.
  - Postgres no-limit as SQL `NULL` with a lazy CASE, one statement, no second SQL text.
  - G149's double parse kept: names are checked before the record so a refusal says `bad_label`
    rather than `bad_option`; recorded as the closing note.
  - A thrown Postgres `listen` stays synchronous (`storage_unavailable` at subscribe); a rejected
    one is warned.

* **Deviations**: `bindValidators` and ShelfVaultDB dropped (Coach). One
  `eslint-disable-next-line @typescript-eslint/no-misused-promises` in `tests/test-helpers.ts`
  (and one in `tests/vault-db.test.ts`), plus `only-throw-error` in `vault-db.test.ts`: an async
  host listener is the case under test. The "leaky unsubscribe" battery test now wraps a VaultDB
  in a Proxy, since the base class no longer lets an adapter leak.

* **Discoveries**: a package's tests resolve sibling packages through `dist/`: rebuild
  (`pnpm --filter safebyok build`) after changing core, or IDB/GraphQL tests see stale code.
  `oneAtATime`'s `begin` and `vault-db.ts`'s `soon` left as they were (no natural absorption).

* **Rows** (34): closed so far in code -- G207, G208, G209, G210, G211, G213 (but for item 5),
  G214 (unchanged: only `doSubscribe` defaults), G270, G149 (with the note above), G511, G285,
  G303, G257, G236, G268 (`idb.ts` doc), G272, G491 (core doc; IDB README line owed), G523.
  Not yet: G304, G247, G240, G519, G250, G292, G286, G300, G305, G258, G252, G246, G233, G248,
  G254, G290.

* **For the Coach**: open matters as their own bullets --
  - *adoptLogger is public surface*: Rec keep (a host composing its own entry point needs it).
  - *A shared VaultDB keeps the latest logger handed it*: Rec accept; documented.
  - *Errors reported twice in browsers* (logger and `reportError`): Rec accept, as designed.
