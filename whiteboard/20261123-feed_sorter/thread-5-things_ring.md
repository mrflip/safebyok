# Thread 5: a Thing receives each event, and the SortedVaultDB's map holds Things (2026-11-24)

Branch `20261124-things_ring`, PR #871, stacked on #870. **Red on purpose**: safebyok 1875 passed, 7 failed (the seven
Minder tests thread 4 lists, untouched); `pnpm justify` red by those seven alone. safebyok-idb-lean 113,
safebyok-postgres 354, safebyok-react-lean 320, safebyok-big 2949 pass; typecheck and lint clean in each.

* **Built**:
  * **`Thing`** (`models/thing.ts`) models the stored Thing at one labelpath across its lives:
    `protected constructor(begun: SeenThing<RecordT>)`, `protected adopt(record: Adoptable<RecordT>)` (was
    `adoptRecord`), `get citable(): ThingCited`, `get agerank()`, `get read_at()`,
    `receive(proposed: VaultEvent<RecordT>): readonly VaultEvent<RecordT>[]`, `pickle(): PickleT`, with
    `PickleT extends Adoptable<RecordT> = RecordT`. `SeenChecks` moved here from the sorter.
  * **A Thing duck types as its record** (second rework, the Coach's ruling in `world-design.md` §10): `adopt` makes
    every field of the record an own, non-writable prop. The loggable ones (`protected get loggableFieldnames()`: the
    Thing fields; a subclass's override, a getter since `adopt` runs inside `super`) are enumerable, the rest hidden.
    Scope fields are non-configurable, set at the first adopt only; the rest configurable, and a field the new record
    lacks is deleted (a sparse tombstone or the shell answers no `sidecar`). Every spread is unchanged: Thing fields.
    `Gate.wayins` and `Bank.lifetok` getters became `declare readonly` props. big's `adorn`/`decorate` take
    `AdornOpts { writable?, configurable? }`, both true unless given false.
  * **`Adoptable<RecordT>`** = `RecordT | Tombstone<RecordT> | ShellOf<RecordT>`.
  * **`Shell.inParentLivesOf(seen)`** (`shapes-thing.ts`): the shell at `seen`'s scope under the lives its lifepath names
    for the Things above it: a soon at box/openai with lifepath `0000000000/0000000002` gives `0000000000/-000000001`.
  * **`storage/agerank.ts`** (was `feed-sorter.ts`): the rule's pure functions, `eventsOf` among them. `FeedSorter` is gone.
  * **`PlainThing`**: a Thing of any kind holding only what was seen; `PickleT` is `Adoptable<ThingRecord>`.
  * **`SortedVaultDB<ThingT extends ReceivingThing = ReceivingThing>`**, `implements Omit<VaultDB, 'watch'>`: the four
    verbs, `listen(listener: SortedVaultDBListener): () => void`, `receive(event: VaultEvent): void`,
    `thingAt(scoped)`, `sweep()`. `SortedVaultDBListener = { hear(event), onBadNews(news) }`. Private: `#tell`,
    `#tellAnswer`, `#tellNotice`, `#receiveAtThing`, `#tellBadNews`. `ReceivingThing = Pick<Thing<…>, 'receive' |
    'agerank'>`; `ThingMaker<ThingT> = (seen: SeenThing) => ThingT`. `isSortedVaultDB` checks the member names.
  * **`Minder.hello(sortedVaultDB: SortedVaultDB)`**, checked by `isSortedVaultDB`
    (`Phrases.SortedVaultDBExpected`); it listens, so `#unwatch`→`#unlisten`, `#takeNotice`→`#hear`.
  * **`readAtOf(read_tc)`** in `thing-classifier.ts`. `VaultEvent` and kin take `RecordT`.
  * **Exports** (made freely, `notes/transition.md`): `Adoptable`; from storage `PlainThing`, `ReceivingThing`,
    `ThingMaker`, `SortedVaultDB`, `SortedVaultDBListener`, `SortedVaultDBOpts`, `isSortedVaultDB`; `ThingFieldnames`
    from `base-thing.ts`; big's `AdornOpts`.
  * **Tests**: `tests/models/thing.test.ts`: the 190 rows drive `PlainThing.receive`, every row unchanged (checked
    against a fresh `gen.py` run, byte for byte with `table.ts.txt`), plus adoption across lives, a Thing begun by a
    soon, citable, `read_at`, refusals, and the props: the enumerable set, a hidden field by name, descriptors, removal. `sorted-vault-db.test.ts`: listen, receive, `thingAt`, make refusals.
    The battery runs over `BatteryVaultDB = Omit<VaultDB, 'watch'>`.
* **Decisions made**:
  * **Words** (the Coach's word-sets): a raw vaultDB watches and notifies, its watcher gets a notice at `onNotice`; the
    SortedVaultDB is listened to, tells, and its listener hears; a device database rings its bell, and what it rings is
    handed to the SortedVaultDB's `receive`. The idb `#ring` keeps its name. Phrases met only by events became
    `EventModelkind`, `EventOfOtherThing`, `EventLiveness`, their text "event".
  * **A listener object**, not two callbacks: the Coach's "calling its listeners' `.hear`", handlers named at the call
    site, and `onBadNews` beside it. No scope argument: a SortedVaultDB serves one bank. Each listen is its own: a
    listener that listens twice is told twice, and each end stops one.
  * **A Thing begun by a soon adopts the shell** under the lives the soon names, and cites the soon; `pickle()` never
    answers undefined, and the props mirror the shell. A later soon moves only citable, agerank and read_at; a whole
    record replaces the shell. Set aside: `pickle()` undefined (an `undefined` branch in every
    caller); props absent (BaseThing types them present).
  * **`makeThing` takes the first record seen**, kept: a Thing made from a scope alone could not say which lives to
    shell under.
  * **What is adopted**: an event whose liveness is not `soon` (a sparse tombstone too). **`read_at`** follows the
    agerank's time rule. **`adopt` is protected**. **The map keeps a Thing only once its first receive takes the record.**
  * **Types left alone**: a class is no union, so `sidecar` and the like are absent from PlainThing's and BaseBox's
    types (narrow `pickle()`); only Gate (`wayins`) and Bank (`lifetok`) declare their own, true since a main gate is
    never a tombstone and a Bank never adopts again. No name clash found in Bank, Gate, BaseBox or PlainThing.
    Set aside: a static `loggableFieldnames`, which needs a cast of `this.constructor`.
* **Deviations**: `adapter-vault-db.ts` and `vaultdb-world.ts` change one import each (module renamed).
  `gate.test` no longer asserts the scope fields configurable.
  `world.ts`'s member `receive` keeps its name: the seven failing tests use it.
* **Discoveries**:
  * **An import cycle**: `thing-classifier.ts` imports `Thing`, and `Thing` imports it. `SeenChecks.readTc` reads
    `ReadTcPattern` only as a check runs; a top-level use in `thing.ts` would crash at load.
  * **`Bank` freezes itself**, so it cannot adopt; `Gate` never freezes.
  * The SortedVaultDB is frozen: spy on its prototype.
* **For the Coach**:
  * **Casts and hatches**: `as Adoptable<RecordT>` over the constructor's ternary (`isSparse` is no type guard);
    `this.#record as PickleT` (now also over `| undefined`, which `adopt` reads at the first adopt; `#record!` gone);
    `val as SeenThing` in a check; the
    battery's `as BatteryVaultDB as VaultDB` in `fresh` and `as BatteryVaultDB as DBT` in `rowsOf`; `as never` for bad
    input in the lifecycle and sorted tests; one `eslint-disable-line @typescript-eslint/no-misused-spread` in
    thing.test's `propsOf` (the spread is the subject, as in bank/gate/lease tests). The lifecycle test's existing
    `@ts-expect-error` stays. Removed: `| undefined` from `PickleT` and PlainThing's generic, the tattoo-of-a-soon branch.
  * **What putting `Bank` and `Gate` in the map needs**: `Bank` to stop freezing itself; `Gate`'s adopt to rebuild its
    wayins from a received record; a `PickleT` that admits the shell, or a contract that it is never received a void;
    Device's maker choosing by kind.
  * **VOCABULARY**: rows watch/notice, listen/tell/hear, ring/bell, Void Sentinel, Thing (reads as its record) and
    minder (listens to its SortedVaultDB) edited; liveness, agerank, citable, read_at added.
  * **Sidecar** is public, host-visible data, yet hidden from a spread: the ruling's "nothing opaque" names `val` and
    wrapped keys only. A subclass could log it with one override.
