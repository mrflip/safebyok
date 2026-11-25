# Thread 7: things_ready, a Bank and a Gate ready to be Things in the map (2026-11-24)

Branch `20261124-things_ready`, PR #873, stacked on #872 (`20261124-world_facade`). Thread B1 of `world-design.md`.
Proved (before the catch-up): `safebyok` typecheck and lint clean, tests 1897 passed and the seven `vault-minder` tests
red on purpose (listen 4, writes 2, staleness 1), no others; `safebyok-big` lint and refusals tests (125) clean;
`safebyok-idb-lean` 113, `safebyok-postgres` 354, `safebyok-react-lean` 320, `safebyok-graphql` 448, each clean.
`pnpm justify` after the catch-up onto #872 (tree of 9e2625809): lint, typecheck and build clean; tests red by those
seven alone (`safebyok` 7 failed, 1897 passed).

* **Built** (all in `packages/safebyok/src/`):
  - `Thing.receive` adopts before it raises: it reads the new `read_at` first (`#readAtAfter`, pure, since adopt may
    move `citable`), then adopts, then sets agerank, `read_at` and `citable`. A receive whose adopt throws leaves the
    Thing as it was (test: `thing.test.ts`, "is left as it was by a receive whose adopt throws").
  - `Bank` no longer freezes itself. `Bank.make` takes `BankRecord | ShellOf<BankRecord>` (a whole record, live or a
    tombstone, or the shell), checked by the new `BankChecks.recordOrShell`. `Gate.make` and `world.makeGate` take
    `GateRecord | ShellOf<GateRecord>`, checked by `GateChecks.recordOrShell`. Both kinds' `PickleT` is now
    `Adoptable<RecordT>`.
  - `Gate` keeps no `#main`/`#passkey0`: `main` and `passkey0` are getters that make a `Wayin` from the live record on
    each read. `Gate.adopt` is overridden, statelessly: a live record's wayin records are re-made through `Wayin` and
    frozen before `super.adopt`, so a received record's wayins are frozen as a made one's are. `#putGate` adopts the
    written record and tells, as before.
  - One private `#demandLive()` per class returns the narrowed live record or throws `Throwers.thingNotLive(labelpath)`:
    kind `absent_thing`, phrase `ThingNotLive`, meta `{ labelpaths: [labelpath] }`.
  - `absent_thing` is a new refusalkind (the Coach, mid-thread: "make it `absent_thing`"), family `condition`. Added in
    `safebyok-big/src/refusals/errors.ts` (`refusalkindVals`, `RefusalFamilyForKind`, the families' doc list) and its
    case row in `safebyok-big/tests/refusals/errors.test.ts`. Nothing else enumerates kinds by hand: GraphQL's
    `SafebyokRefusalkind` enum is built from `refusalkindVals`, so it gains the value; `safebyok-convex`'s
    `safebyokErrorKindVals` lists only what the core throws inside Convex, and this kind is not; the eslint
    `CustomerKinds` lists were left alone.
  - `wayins?: Wayins` and `lifetok?: Lifetok` are typed optional. `Bank` no longer `implements BankStamp`.
  - Shapes: `shellAt(kindLabelpath)` builds a shell check (the old `boxShell`, now shared with the gate); the bank's
    shell is a literal one with no refines (a root's labelpath, label and lifepath are fixed).
  - `gating.ts`: `anteOf` reads `stamp`, `main`, `passkey0` (each refuses a gate that is not live) and narrows the record
    with `GateChecks.record.parse`; `unlockGate` proves against `anteOf(gate)`, as the other bodies do. The birth puts
    the gate record it made, not `gate.pickle()`.
* **Members over the shell or a tombstone** (section 7a's tables):
  - Bank: `stamp`, `rootBox` and the four ask builders call `#demandLive()`; `put` refuses through `makePutAsk`, and
    `sealBox`/`unsealBox` (and the `try` forms, as an Outcome) through `#demandOwnBox`'s `rootBox`. Everything else works.
  - Gate: `stamp`, `main`, `passkey0`, `demandPasskeyAddable` call `#demandLive()`. The twelve makers are callable; each
    body refuses at `anteOf` (addPasskey at `demandPasskeyAddable`), after the cleartexts are taken in, and the gating
    vacates. `#unlockByProving` and `#putGate` are reached only past `anteOf`, so carry no demand of their own.
* **Decisions made**:
  - `Bank.make` checks its gate and the BankMinder's world (`checkRootsAgree`) only for a live record, so a tombstone is
    genuinely taken. Scaffolding: `checkRootsAgree` goes when the world finds its roots as Things (thread B2).
  - The ask builders were not in 7a's table; they need the lifetok, so they refuse too.
  - `lifetok` and `wayins` are record-field props (thread 5's duck typing), so over the shell they are absent, not
    refusing: a getter under a record field's name is ruled out.
  - `main`/`passkey0` identity: a new `Wayin` per read. No source caller compares them by identity (`anteOf` reads each
    once per gating; React lean reads minder records, not the Gate); tests compare `.pickle()` deep. No cache built.
  - Test helpers: `TH.LiveGate`, `TH.LiveBank` (a born bank is one, checked by a type predicate in `buildBornBank`),
    `TH.liveGateOf`, `TH.livePickleOf`, `TH.bankShellOf`, `TH.gateShellOf`, `TH.thingEventOf` (the one cast:
    `VaultItemEvent` of any kind to the record's kind). This keeps `ctx-bytes.test.ts` unchanged and compiling.
* **Approaches set aside**:
  - A zod union with a sparse-tombstone arm, or the kind's `cited` check, so make could take sparse records: a malformed
    whole record would then read as sparse and begin the Thing from the shell, where make refuses it today.
  - Keeping `#demandLive()` at the top of `put`, `sealBox`, `unsealBox`, `#unlockByProving`, `#putGate`: each is
    upstream of a guard already on the path, and in the private verbs, after an await, it would guard a crossing.
* **Deviations**:
  - Gate.make still refuses a main-gate tombstone (the record check's "the main gate is never deleted"); a Gate takes a
    tombstone only by `receive`. Bank.make takes a whole tombstone; neither takes a sparse one.
  - `world.makeGate`'s parameter widened with `Gate.make`'s (a one-line type change in `world.ts`).
* **Discoveries**:
  - Sparse records: the SortedVaultDB's maker is handed any `SeenThing`. Thread B2 must widen make for a sparse record
    (the Thing constructor already begins from the shell) or have the maker pass the shell.
  - The bank test case "refuses a record with a tombstone" refuses by parity (lifeseq 0 with `am: 'x'`), not because it is
    a tombstone; it still passes unchanged.
* **Tests changed** (promise before, after):
  - `bank.test.ts` "shows its Thing fields alone, frozen, ..." asserted `expect(Object.isFrozen(bank)).to.be.true`; the
    assertion is gone and the title says "read-only" (the `lifeseq` write still throws).
  - Type-only, no promise changed: `nextBankThingOf(bank: TH.LiveBank)` in bank.test; `livePickleOf(gate)` for two pickles
    of a `makeGate` gate in gate.test; `proving.test.ts`'s gate helpers typed `TH.LiveGate`; `TH.trackOf` takes any record's
    revseq and lifepath; `buildBornBank` narrows its bank.
* **For the Coach**:
  - `safebyok-graphql` is published, and its schema's `SafebyokRefusalkind` enum now has `absent_thing`. The changeset
    stays `--empty` because no bankDB sends this kind. A `minor` changeset for `safebyok-graphql` would follow PROCESS.md's
    letter, but it bumps the whole fixed group.
  - Is `absent_thing` in the `condition` family? An unborn or deleted bank is normal operation, and the app shows its
    stage, so it is filed with `absent_vault` and `absent_box`.
