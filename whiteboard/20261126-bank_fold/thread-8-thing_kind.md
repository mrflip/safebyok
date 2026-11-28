# Thread 8: thing_kind (2026-11-27)

Branch `20261127-thing_kind` (the handoff named it `20261126-thing_kind`), cut at `763e763c8`. No PR of its own: the
orchestrator carries the commits onto #949. Proved: `pnpm justify` green over the whole repository, 9,340 tests passed
(safebyok 2,470, postgres 181, convex 234, graphql 301, indexeddb 133, react 339, the dojo 111, e2e 576, root scripts 331).

* **Built**
  * **Every Thing states its `modelkind`** (`ThingChecks.sparse`), and the core reads a kind only where it is stated: the
    record, the ask, or the table it is kept in. `Labelpath.modelkindOf`, `isOfModelkind`, `ThingkindChecks.ofLabelpath`,
    `modelkindGiven`, `isModelkindOwn` and `Phrases.BanklabelOfRootBox` / `ModelkindNotOwn` are gone.
  * **One labelpath rule per kind** (`isLabelpathOfKind` in `shapes-thing.ts`): a gate's labelpath is its banklabel
    (`isGateAtBanklabel`, now private), a box's passes `Labelpath.isBox` (`box` or `box/<label>`). `KindedScope` is a
    `ThingScope` with its `modelkind`; the asks, the VaultMinder's `carAt`/`thingAt`/`tryGetOnce`/`getOnce`/`tryListOnce`/
    `listOnce`, `Shell.under` and the battery's row cheats take one.
  * **Kept per kind everywhere a Thing is held by labelpath**: the VaultMinder's cars, memory's tables, Postgres's
    tables (a `modelkind` column, `CHECK`ed to the table's kind), Convex's tables (a `modelkind` literal per table),
    IndexedDB's key ranges. `vaultStatsOf` takes `{ gate, box }`. A watch's `Received` carries the `modelkind` of the
    table written: Postgres's notice `at`, Convex's `watchThings` rows, GraphQL's `SafebyokNotice`, IndexedDB's bell.
  * **`GateStamp` and `BoxStamp` carry `modelkind`**; `BankStamp`, `wayinCtxOf`, `cipherCtx` and the lease's fields stay.
  * **A bank labelled `box`**: born, unlocked, puts and reads a box (`tests/models/bank.test.ts`, "a bank labelled box"),
    and the births battery's case "writes the gate and the root box of a bank labelled box" runs on every adapter with
    a battery but the VaultMinder's (memory, Postgres, Convex, IndexedDB, GraphQL over memory and over Postgres).
  * The dojo's fixture is made again; its inspector reads a root's kind from its record.

* **Decisions made** (the Coach gave authority on gaps)
  * **A lease has no `modelkind`**: it is no Thing. `ThingShaped` (the Thing fields less `modelkind`) bounds the
    record generics a lease shares; `Sparse<RecordT>` picks only the fields `RecordT` has.
  * **`ThingFormat` stays `'a010501'`, and the IndexedDB database name stays**: the format is `LeaseFormat`, which the
    lease's ctx binds, and the handoff forbids a ctx change. The line has not shipped, so nothing older is read.
  * **`RootModelkinds = { gate: 'gate', root: 'box' }`** (shapes-asks) names each root's kind for the stores.
  * **Postgres's `at.modelkind` is the row's own**, which the table's `CHECK` pins to the table.
  * **GraphQL's refused birth names its root by the row's stated `modelkind`**, where it compared labelpaths, which
    tie for a bank labelled `box`.
  * **Battery option `servesOneBank`** (set for the VaultMinder, which serves one bank): it leaves out the cases that
    birth another bank, the new case among them.
  * **`VaultMinder.tryListOnce` answers a bad scope** as a refused answer, as `tryGetOnce` did; it threw.
  * `IncompatibleThing` and `AncestorLives` carry no `modelkind`: each is read under an ask that has it.

* **Deviations**: none from the rulings. The IndexedDB shelf's own `KindedThingScope` is replaced by the core's
  `KindedScope` (re-export over redefinition, `notes/transition.md`).

* **Discoveries**
  * Four places still read a labelpath's text, none to infer a kind:
    * `vault-tsq.ts` `isItemLabelpath` (`Labelpath.isBox(labelpath) && (labelpath !== Labelpath.RootBox)`), for
      `#hearRefused` and `#parseItemScope`. The vault TSQ keeps boxes only, its query keys carry no kind, and
      `onBadNews` is handed a labelpath alone; this is the box rule checking a box key.
    * `bank.ts` `#isRootLabelpath` (`Object.values(rootLabelpathsOf(...)).includes(labelpath)`): a Thing at either
      root labelpath is a root of either kind; for a bank labelled `box`, both are.
    * `Shell.of`'s `Labelpath.parentOf(proposed.labelpath) === ''`: structure, not kind.
    * `react-giver.tsx` `boxLabelpathOf` / `VaultChecks.boxLabelpath`: a box's labelpath against the box rule.
  * Zod 4 with TS 5.5 infers an arrow refine as a type predicate and narrows the output; `(given): boolean =>` stops it.
  * In the devtool's masked view, a bank labelled `box` shows its gate and root box under the same query key
    (`VaultTSQ.itemQueryKeyOf`); the view says it may change without notice, and the dojo keys its rows by kind.

* **For the Coach**
  * The security note is a new entry (2026-11-27). Its subagent noted the header's rule that the same mechanism
    gets an amendment line, and that older entries describe the stamps; it wrote a new entry, as briefed.
