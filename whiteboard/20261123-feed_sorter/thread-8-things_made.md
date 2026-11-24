# Thread 8: things_made, the map's maker makes Bank, Gate and Box (2026-11-24)

Branch `20261124-things_made`, PR #874, stacked on #873 (`20261124-things_ready`). The first half of B2 in
`world-design.md`. Proved before the catch-up: `safebyok` typecheck and lint clean, tests 1907 passed and the seven
`vault-minder` tests red on purpose (listen 4, writes 2, staleness 1), no others; `safebyok-idb-lean` 113,
`safebyok-postgres` 354, `safebyok-react-lean` 320, each typecheck, lint and tests clean. After the catch-up: see the PR.

* **Built** (in `packages/safebyok/src/`):
  - `models/box.ts`: `Box extends BaseBox`, a stub: `make(record)` over a whole box record (live or a tombstone) or its
    shell (new `BoxChecks.recordOrShell`), `scope`, and `stamp` (refuses the shell, as `BoxChecks.stamp` does).
    `BaseBox`'s `PickleT` is now `Adoptable<BoxRecord>`.
  - `World.makeThing(seen)`: overloads `BankRecord -> Bank`, `GateRecord -> Gate`, `BoxRecord -> Box`, and
    `SeenThing -> WorldThing` (`Bank | Gate | Box`, exported) for a sparse record, a shell or a tombstone. It checks
    `seen` (`SeenChecks.seenCited`, bad_record for a labelpath of no kind or not a record) and its bank scope against
    the device's (record_conflict), begins from the record where it is whole, else from `Shell.inParentLivesOf(seen)`,
    and calls the class's own `make(begun, { device }, gateFriend)` from `thingClassOf(modelkind)`, a
    `{ bank: Bank, gate: Gate, box: Box } as const satisfies Record<Thingkind, ThingClass>` table built at call time.
  - `World.bank`, `World.gate` (the map's Things, `instanceof`-narrowed, null for none), `World.bankStamp` (the bank
    Thing's stamp; absent_thing until a live bank), `World.demandRootsLive()` (the bank Thing, refusing absent_thing
    unless bank, main gate and root box Things are live).
  - `Bank.make(record, { device })`: no `gate`; `bank.gate` is `world.gate`, refusing absent_thing while the world has
    none. `checkRootsAgree` is gone.
  - `Gate`: `GateOpts.bankStamp` optional; `gate.bankStamp` is the pinned one or `world.bankStamp`. `#putGate` no longer
    adopts; it still tells its subscribers after the write.
  - `Device`: its SortedVaultDB's maker is `world.makeThing`; `#attachWorld()` is `#attachBank(world.demandRootsLive())`.
  - The birth (`gating.ts`) answers `device.world.demandRootsLive()` in place of `Bank.make(answer.val.bank, { gate })`.
  - `PlainThing` moved to `tests/test-helpers/plain-thing.ts` (on `TH`), dropped from `safebyok/storage`.
* **Decisions made**:
  - **Return types by overloads, no cast.** The whole records are structurally distinct (lifetok, wayins, sidecar), so
    the first three overloads pick the class; a sparse record or a shell is the same type for every kind, so it gets the
    union. Inside, `const thingClass: ThingClass = thingClassOf(...)` compiles because `ThingClass.make` is declared with
    method syntax, which TypeScript checks bivariantly: each class's narrower `make` is accepted. No `as`.
  - **The table is built at call time** (`thingClassOf`), not at module load: world, bank, gate, gating and device import
    one another, and `gate.test.ts` loads `gate.ts` first, so a module-level `{ gate: Gate }` in `world.ts` would read
    `Gate` in its TDZ. No registry, no lazy import.
  - **Not whole -> shell**, not just "sparse -> shell": a sparse tombstone (a list's deleted child) would otherwise reach
    `Box.make`, which takes no sparse record, and be refused at first sight, where `PlainThing` took it. The
    SortedVaultDB's `receive` then adopts the tombstone, or cites the live sparse record. A malformed whole record is
    read the same way (as sparse), as `itemSeenOf` already reads it inside the SortedVaultDB.
  - `Box.make` takes no device: nothing in it needs one yet. `makeThing` checks the bank scope for all three kinds.
* **Pulled forward, declared** (from B2's second half): **the roots restored are received before the minders hello.**
  Item 5 (`device.bank` is the map's) cannot hold on a cached start otherwise: the map has no Things until the vaultDB
  answers, and the cached bank must show before it does. `Device.receiveRestored` hands the BankMinder's cached roots
  to `sortedVaultDB.receive` (sourcelabel `'persister'`, `read_tc` now, the bank's lifetok) between `SortedVaultDB.make`
  and the hellos, so nothing hears them. Scaffolding until the minders start from roots the world restores.
  Consequence weighed: the fetch's same revision, read within the same 65.5-second span, is not news, so the minders do
  not hear it; the BankMinder lands the answer's world itself (`#landWorld`) and its get returns the root box, and the
  VaultMinder minds no root, so nothing a host sees changes.
* **Scaffolding**:
  - Scaffolding: `world.makeGate(record, bankStamp)` and the gate's pinned `#bankStamp`, for a gate made before its
    bank's record (the birth's sealing gate; gates tests make alone). Goes when a birth makes no gate before its record
    (B2's second half).
  - Scaffolding: `receiveRestored` in `device.ts` (above).
* **Host-visible consequences** (forced by "the Gate and Bank are the map's Things"; for the Coach):
  - The gate now follows every record of it the device hears: a gate change made on another device reaches
    `bank.gate` through the watch, after which the old passphrase is `wrong_passphrase` here, not `stale_write`.
  - After a `stale_write` on a gate change, the gate models the stored gate the refusal carried (`dbhas`), not the one
    it had.
  - `bank.put` resolves as before, and the bank then models the record written ("This Bank object is not updated" no
    longer holds).
* **Tests changed** (promise before -> after):
  - `bank.test` "makes a bank of the record with the gate given as its main gate ..." -> "makes the bank its device's
    world keeps, its main gate the world's, locked as the world is" (the born bank; `bank === world.bank`,
    `bank.gate === world.gate`).
  - `bank.test` "is unlocked where its gate is, and locks as its gate does": same promise, on the born bank and its gate
    rather than a second Bank and Gate on the device.
  - `bank.test` removed: "refuses a gate made for another life of the bank" / "... born at another time", "accepts a main
    gate of a later life of its own", "refuses a bank whose world its device's BankMinder has not heard of", "refuses a
    bank of another life than the world its device's BankMinder has": each tested `checkRootsAgree` or the gate opt.
  - `bank.test` "is made from the shell with no world heard of ...": its last line `bank.gate.labelpath === 'gate'` ->
    `bank.gate` refuses absent_thing.
  - `bank.test` "leaves the bank it was called on unchanged" -> "models the revision written once it resolves".
  - `gate.test` "refuses opts with no bankStamp, no opts at all, or no friend" -> "refuses a bankStamp that is not a
    stamp, no opts at all, or no friend" (a missing bankStamp is now taken: the world's).
  - `gate-forms.test` x3 "refuses 'stale_write' over a gate changed elsewhere, leaving the bank locked with the gate it
    had" -> "... changed elsewhere and not yet heard of, leaving the bank locked, its gate then the one stored": the
    helper's vaultDB watch notifies nothing, and the gate is asserted equal to the stored one.
  - `gating.test` "makes one gate, which seals the root box and is the bank's main gate, unlocked" -> "makes a gate to
    seal the root box, and the bank's main gate is the one its device's world keeps, unlocked" (`Gate.make` twice).
  - `device.test` removed: "shows its own bank still when another bank is made over the same vaultDB ..." (a second
    bank on one device; `TH.makeStoredBank` removed with it).
  - Added: `world.test.ts` (makeThing kinds, types, shell, sparse, refusals; bank, gate, bankStamp; demandRootsLive),
    `box.test.ts`, a gate-forms case for a gate following a change made elsewhere, and `device.bank === world.bank`
    assertions in two device cases. Import-only: `thing.test`, `sorted-vault-db.test` (`TH.PlainThing`).
* **Approaches set aside**:
  - A module-level class table in `world.ts`: TDZ under the import cycle (above).
  - Making the cached Bank and Gate by hand until the next thread: two objects at one labelpath, the map's and the
    device's, and a write would reach only the map's.
  - Telling gate subscribers on every `receive` that is news: subscribers would hear re-reads in a later time span;
    `#putGate` keeps its one tell.
* **For the Coach**: the three host-visible consequences above; whether `notes/security.md` should record that the
  gate's wayins and the lease's bank stamp now come from the records the SortedVaultDB keeps (the same vaultDB as
  before, so no new trust; not recorded, pending a go-ahead to spawn its subagent).
