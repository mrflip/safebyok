# Thread 2: records (2026-11-18)

Branch `20261118-records`, PR #744, stacked on #740 (`20261118-namespaces`, itself on #728). Proved: `pnpm --filter safebyok test` 1018 passed, typecheck and eslint clean for safebyok, safebyok-react, safebyok-postgres; `pnpm justify` at the tip: see the PR's Tests line.

The Coach's rule (2026-11-18): `FooRecord` is a plain object's type, always and only; a bare `Foo` is a class. This thread brings the new core's record types back to it, so that a later thread can make `Thing` a class.

* **Built**: a mechanical rename in `packages/safebyok`, with callers in `safebyok-react` and `safebyok-postgres` (no postgres file named a renamed type), and VOCABULARY.md. No behaviour or runtime change. Done by a TypeScript-AST codemod (type positions and import/export specifiers only, so prose "Thing", value names such as the test's `const BoxShell` and big's `BX.GateRecord` were left alone), then by hand.
  - `Thing` -> `ThingRecord` (the union); `BankThing`, `GateThing`, `BoxThing` -> `BankRecord`, `GateRecord`, `BoxRecord`. The `BankRecord` alias in shapes-asks.ts is gone: one type, defined in shapes-thing.ts.
  - Today's `ThingRecord` (fields every kind has) is `Sparse<ThingRecord>` wherever named; its check is `ThingChecks.sparse` (was `thingRecord`, the local too).
  - A box's own forms went generic: `BoxRecord` (live) -> `LiveOf<BoxRecord>`, `BoxTombstone` -> `TombstoneOf<BoxRecord>`, `BoxShell` -> `ShellOf<BoxRecord>`, with `ShellOf<RecordT> = Sparse<TombstoneOf<RecordT>>` new in shapes-sealers.ts. The three aliases are gone.
  - Entry points (index.ts, core.ts, storage.ts) export the new names, no old ones. One empty changeset, `.changeset/20261118-records.md`, as #740's. Tests: a new type test for the forms in `tests/shapes/shapes-thing.test.ts`.
* **Decisions made**:
  - Order of imports in the lists the codemod touched: types first, then values, each in default sort order (as thread 1 left them).
  - **Follow-up, the Coach's rulings of 2026-11-18** (commits after the first build):
    - One fmt: `ThingFormat = 100_501` (eslint's numeric-separators rule refuses `100501`; same value), exported from shapes-thing.ts and storage.ts, and carried by `ThingChecks`. `BankThingFormat`, `GateThingFormat`, `BoxThingFormat`, `ThingFormats`, the shell's `isFmtOwn` and its phrase `ShellFmtOfOtherKind` are gone. `ThingChecks.sparse`'s own `fmt` stays `uint`; a kind's record, the shell checks and `boxStamp` carry `lit(ThingFormat)`.
    - `Bank.tryGetBox` tells a box by `Labelpath.isOfModelkind(val.labelpath, 'box')`, refusing as before (`unclassified_storing`, `otherThanBox`); the `BoxRecord` it answers is a cast, with a `//`.
    - The private `ThingSparse` is gone: `Sparse<RecordT extends Sparse<ThingRecord>>`, `sparseOf` and the shell functions are typed by `Sparse<ThingRecord>`; `ThingFieldname = keyof Z.infer<typeof ThingChecks.sparse>`. `BaseThing.fmt` is `RecordT['fmt']`. Two `as VoidSentinel` casts became unnecessary and went.
    - A box tombstone has every field of a live box, `sidecar` always `{}`: the box record is one object, `am` `'a' | 'x'`; `BoxChecks.live` is it with `am: lit('a')`. `CoreBox.tombstoneOf` writes `sidecar: {}` and still refuses a sidecar given. **A revival after a tombstone or the shell still refuses `sidecarMissing`** when `publicProps` gives no sidecar: `nextRevisionOf` inherits the donor's sidecar only from a live donor (a `//` says so; a new test pins it).
    - `LiveOf` and `TombstoneOf` are the plain intersection again; nothing needed the distributing form. The type test pins a gate and a box.
    - The Coach's hand edits to `Bank.#tryBirth`, `unlockByProving` and `CoreBox`'s `nextRevisionOf`/`tombstoneOf` were swept in as one commit. Not swept: core-box's class doc block, the `tryGetBox` doc block, `.vscode`, shapes-bankish.ts, big's lease.ts.
    - Docs: VOCABULARY.md's *bank row* row now says "In safebyok-big" (its tombstone row had no "no sidecar" to remove). STYLE.md gains the checks-bundle rule (*Validation*) and the companion-object, whole-module-import and `FooRecord` rules (*Naming*); its *Imports* bullet on star-imported validators now defers to the bundle. `notes/security.md` line 67 (a sonnet subagent: the entry is the new core's) says `TombstoneOf<BoxRecord>`, nothing else changed (it still cites a `models/sealers.ts` that does not exist; left).
* **Deviations**:
  - Superseded by the follow-up: `LiveOf`/`TombstoneOf` no longer distribute; `ThingSparse` and the `fmt` narrowing on `BaseThing` are gone.
  - VOCABULARY.md: the *Shapes* intro gains the rule; the *record*, *tombstone* and *shell* rows name `ThingRecord`, `TombstoneOf<BoxRecord>`, `ShellOf<BoxRecord>`. The *bank row* row was marked safebyok-big's in the follow-up.
* **Discoveries**:
  - The guards (`isTombstone`, `isGone`, `isWholeRecord`, ...) kept their names; only their signatures' types changed. `Tombstone<RecordT>` still unions `TombstoneOf<RecordT>` with the sparse tombstone.
  - `notes/security.md` line 67: see the follow-up above.
* **For the Coach**: nothing blocking. A stored box tombstone without a sidecar, and any Thing of the old fmts (3101, 4101, 5103), now reads as damaged (pre-1.0, no migration; the changeset says so).
