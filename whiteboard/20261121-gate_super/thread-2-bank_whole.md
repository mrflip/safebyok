# Thread 2: bank_whole (2026-11-21)

Branch `20261121-bank_whole`, PR [#816](https://github.com/mrflip/safebyok/pull/816), stacked on [#815](https://github.com/mrflip/safebyok/pull/815)
(`20261121-gate_holds`); the PR's base stays `main`. Proved: see the PR's **Tests:** line.

The Coach: "The weird liminal gate-then-bank creation goes: a Bank fully constructs." A Bank is now made
whole, from its gate made first, and there is no unborn Bank.

* **Built**
  * `Bank.make(record, { device, vaultDB, gate })` (`src/models/bank.ts`). `record` is the bank's Thing,
    with its root box at `rootBox` (`BankMakeRecord`, `src/shapes/shapes-bankish.ts`), and the root box must
    be live (`BoxChecks.live`): its shell or tombstone refuses `bad_record`. `opts.gate` must be a Gate
    (`Phrases.GateExpected`). Its `bankStamp` is checked against the record's stamp
    (`Validator.checkedConsistent`, `record_conflict`, `meta.fieldnames`). The bank is locked or unlocked as
    its gate is.
  * `Bank.makeRecord(stamp: BankStamp): BankRecord`: the first record of the bank's Thing alone.
    `BankDna` is gone (`src/core.ts` no longer exports it).
  * The birth (`birthBank`, `src/models/gating.ts`) makes one gate with `Gate.makeRecord`/`Gate.make`, unlocks
    it once, seals the root shell (`Shell.of`, labelpath `Labelpath.RootBox`) under it, stores, and hands that
    gate to `Bank.make` with the stored bank and root. Its `finally` became a `catch`: any throw after the gate
    is made sweeps it. The steps after `tryBirthBank` are `Bank.make`'s checks and `attachBank`, which fail
    only on a broken state.
  * `Device.#bringUp` (`src/models/device.ts`) makes the gate from the stored gate record, then the bank
    with it. Nothing else there changed.
  * Tests: `tests/models/bank.test.ts` rewrites the `makeRecord` and `make` describes (gate given, locks
    with its gate, refuses a gate of another stamp, a non-Gate gate, no gate, the root's shell, tombstone
    or shell revision). `tests/models/gating.test.ts` adds: a birth makes one gate, which is
    `bank.gate`, unlocked; and where the vaultDB answers a root box that is not live, the birth refuses
    `bad_record`, makes no bank, and its gate is swept. `TH.makeStoredBank(born)`
    (`tests/test-helpers/models-world.ts`) makes another bank over a born bank's records the way hello
    does; `BornBank` carries `record: BankMakeRecord` and `gateRecord`. spyBirths is unchanged.
  * Ride-along (#815's second review): VOCABULARY's **seal** bullet says what sealing is and drops the
    call paths. Its own commit.
  * `notes/security.md`: an amendment line after #815's gate_holds entry (sonnet subagent).

* **Decisions made**
  * **`BankDna` dropped**, not reshaped: with the gate made by `Gate.make` and the shell by `Shell.of`,
    the only thing left for it to bundle was the bank's record. The birth's root shell comes from
    `Shell.of(device.scope + root labelpath)`, not `device.rootBox`, which answers the bank's root once one is
    attached.
  * **What `Bank.make` checks of the gate**: only that it is a Gate whose `bankStamp` matches the
    record's stamp. Not its device or vaultDB, nor whether it is swept. See *Open matters*.
  * **The vaultDB answer's `gate` is no longer read** by the birth: the bank takes the gate that wrote it.
    The answer's bank revtok is still checked (`gateMadeElsewhere`), and its bank and root go through
    `Bank.make`'s checks.
  * **The catch sweeps on any throw**, including `Bank.make` and `attachBank`, so a broken answer leaves no
    unlocked gate behind.

* **Deviations**
  * `Bank.make`'s doc block no longer promises "Locked": the bank is locked or unlocked as its gate is.
    That is the spec (the birth hands it an unlocked gate), but it changes the old doc's promise.
  * Dropped the old test "makes the root box its shell, which the birth seals": an unborn Bank no longer
    exists; gating tests cover the first-revision live root.

* **Discoveries**
  * `Gate.make` accepts a whole bank record as its `bankStamp` (`BankChecks.stamp` drops extra fields),
    so `#bringUp` and `makeStoredBank` pass the record straight in.
  * `Phrases.BankSwept` and `GateSwept` tell a host to "make it again with Bank.make"; a host cannot do
    that without a gate now. Left as is (open matter).

* **For the Coach** (open matters)
  * **startup**: `#bringUp` still casts the minder's three records with `as` and builds the gate and
    bank inline. Recommend the startup redesign take the bank record, gate record and root box from the
    minder in one checked step, and hand `Bank.make` what it needs. Not done here, per the handoff.
  * **gate's device**: `Bank.make` does not check that the gate is on the same device and vaultDB.
    Recommend leaving it: the stamp check catches the mistake a caller could make, and both callers make
    the gate on the spot.
  * **swept phrases**: `BankSwept`/`GateSwept` point at `Bank.make`. Recommend rewording them to "make it
    again" with the device's hello when the startup redesign lands.

* **Set aside**
  * Reshaping `BankDna` to carry the gate made: it would have kept a bundle that only the birth unpacks.
  * Checking the gate unswept in `Bank.make`: a swept gate is an end-of-life state, and a crossing at
    best (#no-slop-crossings).
