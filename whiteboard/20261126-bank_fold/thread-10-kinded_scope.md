# Thread 10: kinded_scope (2026-11-27)

Branch `20261127-kinded_scope`, cut at `125f89ed0` (the line's tip); no PR of its own (the line is PR #949). Proved:
`pnpm justify` green over the whole repository, 9,409 tests (9,408 at the cut, and one new: a `box`-labelled bank's
gate and root box get two query keys), run with nothing else building. The first run was red in the dojo, whose
fixture keyed IndexedDB rows in the old order: fixed in `57365b61b`.

The ruling (the Coach, 2026-11-27, superseding his "I would not add the modelkind to the scope"): "this feels like it
should be the new ThingScope: modelkind, userid, banklabel, labelpath -- not having two scopes everywhere."

* **Built**:
  - `ThingScope` is `modelkind, userid, banklabel, labelpath`, kind first, its check refining the labelpath by the kind
    (`isLabelpathOfKind`); `KindedScope` and `ThingChecks.kindedScope` are gone. `TableScope` (`modelkind, userid,
    banklabel`; `ThingChecks.tableScope`) is a table of one bank, replacing memory's `TableScope`, IndexedDB's
    `KindScope` and `checkedWatchedOf`'s inline type. `vault.ts`'s `BoxAt` is `ScopeAt<BoxLabelpath> & { modelkind: 'box' }`.
  - `rootScopesOf(bankScope)` (shapes-asks, exported from `safebyok/storage`): each root's scope, typed by its kind.
    It replaced `rootLabelpathsOf` + `RootModelkinds` assembly in memory, IndexedDB, Convex, the VaultMinder, the
    device, the bank and `actualRootsOf`.
  - IndexedDB's key is `[modelkind, userid, banklabel, labelpath]`; `descendantsRangeOf` and `tableRangeOf` (was
    `kindRangeOf`) follow. One object store still.
  - Query keys: `['sok', modelkind, userid, banklabel, 'item'|'list', ...labels, mark]` (were `['sok', userid,
    banklabel, ...]`). `query-keys.ts`'s `bankKeyHeadOf` is `tableKeyHeadOf`; `VaultTSQ.bankQueryKeyOf` is
    `tableQueryKeyOf(TableScope)`. The vault TSQ sets its query and mutation defaults on `['sok', 'box', userid,
    banklabel]`. safebyok-react's signed-out keys take `'box'` after `'sok'`; `formMutationKeyOf` is unchanged.
  - Labelpath-only addressing replaced by the scope: `VaultMinderListener.onBadNews(news, scope)`, the vault TSQ's
    `#hearRefused(scope)` (`isItemScope` for `isItemLabelpath`), `BaseThing.haveSameScope` compares modelkinds,
    `ThingCar.#take` checks the event's modelkind, `Bank.#isRootScope` (was `#isRootLabelpath`, used by `makeThing`
    and the root shelf's hear), `Bank.#rootThingAt(rootckey)`. The devtool's masked view (`ThingCar.inspectable`) now
    keys a `box`-labelled bank's gate and root box apart, through the query key.
  - `AncestorLives` and `IncompatibleThing` carry `modelkind` (both are `ThingScope & ...`). GraphQL's
    `ancestorLivesOf` adds it; GraphQL's wire `SafebyokIncompatibleThing` is unchanged: the client rebuilds the
    incompatible row from its ask, kind included.
  - D: `Shell.of`, `Shell.under`, `Shell.inParentLivesOf` are generic in the kind (`ShellOf<KindRecords[KindT]>`).
    Five casts went (use-draft `citedOf`, `actualRootsOf` x2, `openaiShellOf`, `boxShellInParentLivesOf`); two are in
    `Shell.of` itself, and `BaseThing.shellOf` passes `<Thingkind>` explicitly (inference from a union of records
    picks one kind).
* **Decisions made**:
  - `lease.scope` stays `{ userid, banklabel, labelpath }`, retyped from `ThingScope` to the existing `LeaseScope` (the
    deviceDB's filing address): a lease is no Thing, and adding `modelkind: 'lease'` would have collided with
    `LeaseScope`, which deviceDB listeners and lease filing use.
  - IndexedDB's `VaultDBVersion` stays `002-001-001`: thread 3 bumped it on this same unreleased line, so no released
    database has the 002 layout.
  - The vault TSQ's mutation defaults moved with its query defaults to `['sok', 'box', userid, banklabel]`; no caller
    relied on them at `['sok', userid, banklabel]` (react's form mutations and `mutationOptionsOf` carry the same
    options inline).
  - `checkedWatchedOf(table, raw)` checks the raw labelpath by shape first, as before, not by the kind's rule, so a
    watched row at another kind's labelpath still reads `incompatible_row`, not `storage_issue`.
  - `three-way.ts`'s `RowAt` stays `[row, labelpath]`: each row is checked by its kind first, so the address check
    within the ask's kind is the rest of it. Memory's, Postgres's and Convex's per-kind tables are unchanged.
* **Deviations**: none from the handoff. `ThingCar.citable` stays `Sparse<ThingRecord>`: typing it by the car's Thing
  moves the cast into ThingCar and adds generics (machinery), so `vault.ts`'s `car.citable as Sparse<BoxRecord>` stays.
* **Discoveries**: zod 4.6 refuses `.pick`, `.omit` and `.partial` on a refined object; the asks now spread
  `ThingChecks.thingScope.shape` into `obj(...)` and refine again, and `thingWatchScope` is `ThingChecks.bankScope`.
  `docs/guide-react_query.md` (a forward design) named the old key head; it now says `['sok', 'box', userid, 'main', …]`.
* **For the Coach**: what still addresses a Thing by labelpath alone, each within one kind: the throwers'
  messages (`thingSoonestBare(labelpath)`, `thingNotLive`), the VaultMinder's per-kind car maps, three-way's `RowAt`,
  memory's per-kind `BankRows`, the vault's and vault TSQ's box-only helpers, `BankAskDraft` (`modelkind` beside it).
