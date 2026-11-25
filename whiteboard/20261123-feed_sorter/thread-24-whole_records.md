# Thread 24: whole_records (2026-11-24)

Branch `20261124-whole_records`, PR [#890](https://github.com/mrflip/safebyok/pull/890), stacked on
[#889](https://github.com/mrflip/safebyok/pull/889). Proved: see the PR's **Tests:** line (`pnpm justify` in full, and
the dependents by hand). The inventories the brief asked for (optional fields left; where records are made) are in
[thread-24-whole_records-inventory.md](thread-24-whole_records-inventory.md), for the following thread.

Built by hand (no /sprint), the Coach's directive: "don't make sparse of anything except Box; make every tombstone
whole". Five pieces.

* **Built**:
  * **R1, whole records.** `PerKindChecks.boxSparse` / `BoxChecks.sparse` (strict: a live box's Thing fields, neither
    body key) and the type `BoxSparse` name the only sparse form; `SparseOf<RecordT>` is `BoxSparse` for a box, `never`
    otherwise. `Sparse<RecordT>` stays as the name of a record's Thing fields (too widely used as a constraint to
    rename). `BaseThing.isSparse` is now `BoxChecks.sparse` of the class's kind. `Tombstone<RecordT>` is whole;
    `ItemSeen`'s `soon` is a `SparseOf`; `isSeenForm` (shapes-vault-event.ts) refuses any other form at the event check
    and at the minder's rung check (`SeenFormUnknown`). The classifier's listing carries a live box sparse and every
    other Thing whole (`listedOf`). The root shelf's check is a union of the three whole-record checks. "Or a sparse
    tombstone" wording goes from the getters. IDB-lean and Postgres list through `classifyListThings`: no change there.
  * **R2.** `VaultMinder.#citableAt` cites the void revision where no Thing is kept: `Shell.Cited` at a root,
    `Shell.childCited(parent lives)` below one.
  * **R3.** Each raw verb begins with `#checkOwnAsk` (`ThingChecks.bankScope.parseConsistent`): an ask of another
    bank answers `refusedAnswerOf`, reaches no vaultDB, leaves `#newestBanktok`.
  * **R4.** A list of a parent not live refuses `absent_thing` (`Throwers.listParentNotLive`): dbhas the tombstone,
    the shell at a root, null below one. `ifAbsent` leaves the list ask, `ListAskDraft`, `listAskOf`, `makeListAsk`.
    React: `useBoxList` is not enabled at stage `unborn` (`isListStage`, `skipToken`); `GateShown` is
    `HeaderedGate | ShellOf<HeaderedGate>`.
  * **R5.** `tests/minding/vault-minder/vault-minder-flags.test.ts`: seven rows (stored × citation), six flag columns.
* **Decisions made**:
  * R2's citation is the shell under the record's parent lives, not `Shell.Cited` everywhere: the act tables read only
    revseq -1 and the void revtok, but the ask's checks (`lifepathNotKept`, `lifeseqNotNext`) need the record's leading
    lives. It is what `Vault.#sealedWriteOf` cites over a shell. So a first revision is born; a later one refuses
    `bad_record` at the ask check; a first revision over a row stored but not kept answers `stale` with the row.
  * R4's dbhas below a root is null: the listing fetches no ancestor, and fetching one would change the IDB and
    Postgres listing queries. Set aside.
  * R4 has its own thrower: `thingNotLive`'s phrase names "This bank or gate".
  * A box with half its body is neither whole nor sparse, and is refused at `receive` (it was sparse before).
  * The Coach's later word on exact runtime checks: kept exact, at no cost to the instance. `BaseThing.sparseOf`
    picks the Thing fields, so a sparse form never has a body key set to undefined; nothing was loosened.
* **Deviations**: none from the brief's pieces. Safety hatches added: `as BoxSparse` in the classifier's `listedOf`;
  `as CitedOf<RecordT>` on `#citableAt`'s void branch; `val as SeenThing` in the two `isSeenForm` refines; in
  react-lean `as ShellOf<HeaderedGate>` replaces `as Tombstone<HeaderedGate>`.
* **Discoveries**:
  * **Cannot be made whole** (apart from the sparse box): the shell has no body, so `Gate.wayins/auth/sigs/meta`,
    `BaseBox.sidecar/whisper_sealed` and `Bank.lifetok` still answer undefined over it (`wholeOf(this.pickle())?.wayins`).
    `BaseThing.isWhole` calls the void sentinel whole ("The void sentinel is whole"). No whole main-gate tombstone
    passes `GateChecks.record` (`isMainGateLive`), so a Gate now refuses every main-gate tombstone, where it took a
    sparse one before. A list's dbhas below a root is null, not a shell.
  * R5's table, all as the act tables say. Surprises: `ifAbsent: 'fail'` over nothing or a tombstone refuses
    `absent_vault` (safebyok-big's `actRefused('vault', act)` mapping), where a list now refuses `absent_thing`;
    `ifAbsent: 'add'` citing the void revision over a tombstone is `stale`, never `reborn`: a host must cite the
    tombstone; `ifPresent: 'get'` passes over any stale citation of a live box, answering the stored record.
  * Who reads a body field off `cited`: only `checkWriteInvariants`'s testimony check (`ask.cited.wayins?.main`, for
    `replace_passphrase`). Cited as Thing fields alone would need the testimony carried elsewhere in the ask.
  * The once verbs' `thingAt(...) === undefined` checks are untouched.
* **Test promises changed**: listed before → after in the PR body.
* **For the Coach**: the open matters in the PR body; and whether `ifAbsent: 'fail'` on a put should refuse
  `absent_thing` as the list does.
