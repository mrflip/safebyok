# Thread 2: records (2026-11-18)

Branch `20261118-records`, PR #744, stacked on #740 (`20261118-namespaces`, itself on #728). Proved: `pnpm --filter safebyok test` 1018 passed, typecheck and eslint clean for safebyok, safebyok-react, safebyok-postgres; `pnpm justify` at the tip: see the PR's Tests line.

The Coach's rule (2026-11-18): `FooRecord` is a plain object's type, always and only; a bare `Foo` is a class. This thread brings the new core's record types back to it, so that a later thread can make `Thing` a class.

* **Built**: a mechanical rename in `packages/safebyok`, with callers in `safebyok-react` and `safebyok-postgres` (no postgres file named a renamed type), and VOCABULARY.md. No behaviour or runtime change. Done by a TypeScript-AST codemod (type positions and import/export specifiers only, so prose "Thing", value names such as the test's `const BoxShell` and big's `BX.GateRecord` were left alone), then by hand.
  - `Thing` -> `ThingRecord` (the union); `BankThing`, `GateThing`, `BoxThing` -> `BankRecord`, `GateRecord`, `BoxRecord`. The `BankRecord` alias in shapes-asks.ts is gone: one type, defined in shapes-thing.ts.
  - Today's `ThingRecord` (fields every kind has) is `Sparse<ThingRecord>` wherever named; its check is `ThingChecks.sparse` (was `thingRecord`, the local too).
  - A box's own forms went generic: `BoxRecord` (live) -> `LiveOf<BoxRecord>`, `BoxTombstone` -> `TombstoneOf<BoxRecord>`, `BoxShell` -> `ShellOf<BoxRecord>`, with `ShellOf<RecordT> = Sparse<TombstoneOf<RecordT>>` new in shapes-sealers.ts. The three aliases are gone.
  - Entry points (index.ts, core.ts, storage.ts) export the new names, no old ones. One empty changeset, `.changeset/20261118-records.md`, as #740's. Tests: a new type test for the forms in `tests/shapes/shapes-thing.test.ts`.
* **Decisions made**:
  - `Sparse<RecordT extends ThingSparse>` and `sparseOf` use a private `ThingSparse` (`Readonly<Z.infer<typeof ThingChecks.sparse>>`) and `ThingFieldname = keyof ThingSparse` in shapes-thing.ts, so `Sparse` is defined from the check and not from `ThingRecord` (no circularity). `ThingFieldnames` still comes from the check's shape.
  - Order of imports in the lists the codemod touched: types first, then values, each in default sort order (as thread 1 left them).
* **Deviations**:
  - **`LiveOf` and `TombstoneOf` distribute**: `RecordT extends unknown ? RecordT & Readonly<{ am: 'a' }> : never`, not the bare intersection of the plan. The bare form, passed a generic union (inside `BodyOf`), left a `Gone & { am: 'a' }` member unreduced to `never`, and `Omit` of the union lost `sidecar`, so a box's public props (`BoxPublicProps`, `LivePublicPropsOf`) refused it. The distributing form reduces it, and a gate (`am: 'a' | 'x'`) gets `LiveOf<GateRecord>['am'] = 'a'` as asked. A new type test pins both.
  - **`Sparse<ThingRecord>` is not the old `ThingRecord` in `fmt`**: it picks from the union, so its `fmt` is `3101 | 4101 | 5103`, where the old type's was `number`. Two places needed `number`: the shell functions' parameters (`rootShellOf`, `demandConsistentParent`, `Shell.of` and its two `*WithParentage` helpers, whose `raw` may carry any `fmt` for the check to refuse), which take `ThingSparse`, the old type, with a `//` comment; and `BaseThing`, which `implements Sparse<ThingRecord>` and now declares `fmt` as `Sparse<ThingRecord>['fmt']` (the kinds' formats) instead of `number`. The latter narrows a class's prop type, with no runtime effect. `AnyThingRecord` (waiting on a dependency) is the proper home for the loose type.
  - VOCABULARY.md: the *Shapes* intro gains the rule; the *record*, *tombstone* and *shell* rows name `ThingRecord`, `TombstoneOf<BoxRecord>`, `ShellOf<BoxRecord>`. The *bank row* line (`BankRecord`, `BankTombstone`, fmt 3001) describes big's row and is left.
* **Discoveries**:
  - The guards (`isTombstone`, `isGone`, `isWholeRecord`, ...) kept their names; only their signatures' types changed. `Tombstone<RecordT>` still unions `TombstoneOf<RecordT>` with the sparse tombstone.
  - `notes/security.md` line 67 still says `BoxTombstone`; left, as the plan puts it out of scope.
* **For the Coach**: nothing blocking. The `fmt` narrowing on `BaseThing` is the one type change a reader may not expect from a rename.
