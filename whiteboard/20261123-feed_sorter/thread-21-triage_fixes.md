# Thread 21: triage_fixes (2026-11-24)

Branch `20261124-triage_fixes`, PR [#887](https://github.com/mrflip/safebyok/pull/887), stacked on [#886](https://github.com/mrflip/safebyok/pull/886). Proved: see
the PR's **Tests:** line (`pnpm justify` in full).

Built by hand (no /sprint): four triage items the Coach approved (A to D), each its own commit.

* **Built**:
  * **C**. The type `WorldThing` (`Bank | Gate | Box`) is `SomeThing`, in `src/models/world.ts` and `src/core.ts`. Nothing
    else named it.
  * **A**. `VaultTSQ` sets no `structuralSharing`: `frozenOrSharedOf` is gone, and an item takes TanStack's default,
    `replaceEqualDeep`. The class doc says an item deep-equals its Thing's record, and a part a revision leaves unchanged
    stays the same object. The giver's comment on `boxQueryBaseOf` says its structural sharing is TanStack's.
  * **D**. `Thing`'s constructor takes an `Adoptable<RecordT>` and adopts it: no sparse branch, no `SeenThing`, no cast.
    `world.makeThing` is the one place a sparse record becomes the shell. The tests' `PlainThing.make(seen)` does as the
    world does (`isWhole(seen) ? seen : Shell.inParentLivesOf(seen)`), so the VaultMinder and the Thing table receive the
    record after, as production does. `proving.buildLease`'s `renewed` lost its `= null` default (only tests left it out).
  * **B**. `vault.putBoxOnce`/`tryPutBoxOnce` answer `LiveOf<BoxRecord>`, `delBoxOnce`/`tryDelBoxOnce` answer
    `TombstoneOf<BoxRecord>`: the record the vaultDB reports stored, once the box at its scope is kept. The giver's
    `putBoxOnceAt`, `delBoxOnce` and `useDraft`'s put return it with no cast. `Thing` has one protected `demandLive()`
    (refuses `absent_thing`, `Throwers.thingNotLive(this.labelpath)`), replacing `Bank`'s and `Gate`'s private
    `#demandLive()`, which were identical.
* **Decisions made**:
  * **B narrows by guard, not cast**: after the answer, `if ((this.#boxAt(answer.val) === undefined) || ! BaseBox.isLive(answer.val))`
    refuses `storage_issue` (`isGone` for a delete). The first half is the old `#boxOutcomeOf`'s check; the second is never
    false in a working case and replaces the `as` the pre-#880 code had.
  * **B answers `answer.val`, not the Box's record**: it is whole (a Box may hold a sparse tombstone), it is what the
    vaultDB stored, and the try verbs never throw for it.
  * **B: `demandLive` is protected**: it replaces two private members and nothing outside a Thing calls it. Public is one word.
  * **B: its one cast**, `return record as LiveOf<RecordT>` in `Thing.demandLive`: TypeScript does not narrow a record of
    the type parameter by `am`. A type predicate would be the same cast in other clothes.
  * **D: `PlainThing.make` repeats the world's one line** rather than a new shared helper; a helper exported for one test
    double seemed more machinery than the line.
* **Test promises changed** (before → after):
  * A, `vault-tsq.test.ts`: item defaults have a `structuralSharing` function → have none; "keeps the Thing's own record as the
    item, and a select's equal result as the same object across revisions" → "keeps the parts a revision leaves unchanged,
    and a select's equal result, as the same objects" (a `structuredClone`d revision; `whisper_sealed` keeps its identity);
    "sets a whole live record as the item, the Thing's own object" → "..., deeply equal to its Thing's"; "hears nothing once
    swept": the item is the Thing's record → the item is the object it was before the sweep; "hold the Thing's own record,
    which getOnce resolves" → "hold a record deeply equal to their Thing's, which getOnce resolves"; identity → deep equality
    in "are stale while cold", the two refetch-after-a-newer-life cases, and the two carried-over putOnce cases.
    Kept as identity: the seed (`initialData` is built from the Thing's record), and an equal revision seen again keeping
    the item's object (TanStack's default keeps it).
  * A, chain table: `endFaultsOf` "the item is its Thing's own record" (`===`) → "deeply equals its Thing's record"
    (`isEqual`). A harness change: no row changed, `gen.py` untouched.
  * B, `vault.test.ts`: "answers the box its device's world holds, whose record is its item" → "answers the record stored,
    which its box then holds, and its item"; "resolves a birth with the box holding the revision stored" → "resolves a birth
    with the record stored, which is its item"; tryDelBoxOnce "answers the box, holding the tombstone stored" → "answers the
    tombstone stored, which its box then holds"; `answer === boxAt(...)` → `answer` deep-equals `boxAt(...).pickle()` (three
    cases); the sweep cases' item `===` the put's record → deep-equal. The rest drop `.pickle()`/`livePickleOf`, also in
    `device.test.ts`, `idb-persister.test.ts` and `record-hooks.test.tsx`.
  * D: the Thing table (190 rows) runs unchanged; only `PlainThing.make` changed. `RefusingThing.make` takes an
    `Adoptable`. The proving tests pass `null` for `renewed`; the describe reads `proving.buildLease(gate, cited, renewed)`.
* **Discoveries**: other members in `src/models/` and `src/minding/` that only tests reach, left for the Coach:
  * `world.ts`: the narrow overloads `makeThing(seen: BankRecord): Bank` / `GateRecord): Gate` / `BoxRecord): Box`.
    Production calls `makeThing(seen: SeenThing): SomeThing` through the device's maker; only `world.test.ts` and
    `proving.test.ts` use the narrow ones.
  * `gate.ts`: `sweep(endCause: Errors.VaultError | null = null): this` has no production caller, and through it alone does
    `World.sweep`'s `endCause` arrive (`this.#endCause = endCause ?? this.#device.endCause ?? Throwers.bankSwept()`). A
    public verb, and an ending: listed only.
  * `base-box.ts`: `nextRevisionOf(donorProps, publicProps: BoxPublicProps = {})` and `tombstoneOf(..., publicProps: BoxPublicProps = {})`:
    the defaults are reached only by tests; `lease.ts` always passes `given`. Public statics of an exported class.
  * `vault-minder.ts`: `async delOnce<RecordT extends ThingRecord>(args: DelOnceArgs<RecordT>): Promise<RecordT>`: one test
    calls it; production uses `tryDelOnce`. The throwing half of a try pair.
  * Not test-only, but public with no outside caller: `get knownRoots(): Track | undefined` in `vault-minder.ts`, read only by
    its own `#bankFields`.
  * Public host verbs only tests call (`VaultTSQ.bankQueryKeyOf`, the gatings' `tryAttempt`, the vault's `try*` verbs,
    `VaultMinder.VaultDBSourcelabel`) are API, not candidates.
* **For the Coach**: the open matters in the PR body.
