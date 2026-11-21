# gate_super: the Gate superintends a bank's gating

Proposed 2026-11-21, for the Coach; checked against main at 0dd292ea4 (#811). Not yet agreed: the open matters at the end go to `/turbochat`.

## Why

`Bank` today is two things: the bank's Things (its record, root box, vaultDB, asks, vaults, snapshot) and the
superintendent of getting in (its main gate, its lease, the awaited `unlock` gating, the five form verbs and their
gatings, `putGate`). The second half belongs on `Gate`: the superintendent of gatings, wayins and provings, holding
the lease they produce.

Moving it also lets a `Bank` be made only once its bank is stored. Today a birth makes a `Bank` around the root box's
shell, builds a lease from that half-made bank, seals the root, stores, and only then swaps the shell for the stored
root (`bank.#rootBox = Object.freeze(BoxChecks.live.parse(answer.val.root))`) and hands the bank to its device
(`device.adoptBornBank`). Under the new shape the birth makes the gate first, which is all a lease and the root's
seal need, and makes the `Bank` from the records stored.

## The shape

### A Thing is one life

A `Thing` models one life of a stored Thing, not one revision (the Coach, 2026-11-21): a box is not meant to be
replaced on every saved change to its sidecar. thing.ts says "one revision" today, and fixes its fields for good
(`Helpers.tattoo(this, …, { configurable: false })`, a `readonly #record`). It gains a protected way to adopt a newer
record of the same life, and its doc block says "one life". No other Thing calls it yet: `Bank` has no field that
changes, and the box models are left as they are.

### One `Gate`, whose props update as a write lands

`Gate` stays the one class, a Thing of the gate's record. A gate change no longer makes a new `Gate`: where the write
lands, the gate's private `#adopt(record)` sets its Thing fields, `#main` and `#passkey0` from the record stored. It
stops freezing itself, since a frozen object's props cannot be set again; nothing outside it can write them, as
today. `#adopt` takes the record as the same life and checks nothing about a change of life: what a gate does at a
life change waits.

It gains, from `Bank`:

* `#lease`, `#attachLease`, `lock()`, `isLocked`, `isUnlocked`, and `seal` / `unseal` (open matter 3).
* The awaited `unlock` gating: `#unlockWait`, `ensureUnlocked()`, `dismissUnlock()`, `isUnlockWanted`.
* The form verbs and their makers: `unlockGating` / `unlock` / `tryUnlock`, and the same three for
  `replacePassphrase`, `addPasskey` and `revokePasskey`; and a static `Gate.birthGating(device, cleartexts)`.
* The gatings' private verbs: `#unlockByProving`, and `#putGate`, which writes and then calls `#adopt`.
* `sweep()`, `endCause` (its own, else its device's), `isEnabled`, `demandEnabled()`.
* `subscribe`: a change signal its bank listens to, as the device listens to its bank today (open matter 4).

`Gate.make(record, { device, vaultDB, bankStamp })` needs no `Bank`; today's `{ bank }` is already only a
`Pick<Bank, 'stamp'>`.

A gating reads what it needs of the gate before its first await, as it does today with `const ante = bank.maingate`:
the record it cites (`gate.pickle()`, frozen), and the wayins it proves against and carries forward. So the write
still cites the revision the gating proved against. That is what the code does now, kept; nothing new guards it.
`makeNextRecord` takes the cited record in place of reading `this`.

### What `Bank` keeps

`device`, `vaultDB`, `scope`, `stamp`, `rootBox` (now `readonly`, always the stored root), `track`, `queryCacheOpts`,
the snapshot (`getSnapshot`, `subscribe`, `#align`, `#makeSnapshot`, which reads the gate's `isLocked`, lease end and
`isUnlockWanted`), the ask builders, `tellBadNews`, `put`, the box verbs (`sealBox`, `tombstoneBox`, `unsealBox`:
the own-box check and the ask stay here, the seal goes through the gate), `hostVault`, `sweep` (its gate, then its
vaults), `isEnabled` / `endCause` / `demandEnabled`, and `gate` in place of `maingate`.

`Bank.make(record, { device, vaultDB, gate })`: `record` is the bank's Thing with its stored `rootBox`; the gate
arrives made, and its `bankStamp` is checked against the record.

### Who holds the lease

The Gate. `Lease.make`'s owner becomes a `LeaseGate`, `Pick<Gate, 'bankStamp' | 'lock' | 'isEnabled' |
'demandEnabled'>`, in place of `LeaseBank`. The lease reads `gate.bankStamp` where it read `bank.stamp`, so every ctx
it builds is byte for byte what it is today (ctx-bytes.test.ts pins that). A damaged lease locks the gate, which
tells its bank. The cascades keep one verb name: `device.lock → bank.lock → gate.lock`, `device.sweep → bank.sweep →
gate.sweep → lease.sweep`.

### The two ways a Bank is made

* **Birth** (body in models/gating.ts, maker `Gate.birthGating`): mint the stamps; build the provings and the wayins;
  `Gate.makeRecord`; `Gate.make`; unlock the gate by the passphrase's proving through the gating's friend; seal the
  root box over the shell with `gate.seal`; `tryBirthBank`. Refused, or `gate_made_elsewhere`: the gate is swept and
  no `Bank` ever existed. Stored: `Bank.make` from the records the vaultDB answered, with the gate, already unlocked,
  and `device.adoptBornBank` as today.
* **From storage** (`Device.#bringUp`, from the minder's three records, and device.test.ts's "later" banks):
  `Gate.make` from the stored gate, then `Bank.make` with it, locked.

## What a host or a test sees change

* **`bank.gate` is the same object across a gate change**, its props updated. Today `bank.maingate` is a new object
  after each.
* **The gate is unlocked before the birth reaches the vaultDB**, since the root box is sealed under its lease. Today
  the lease exists then too, but is attached only after; spyBirths' `lockedAtBirths` goes.
* **A gate verb resolves the gate**, not the bank, where a caller calls it on the gate (open matter 1).
* **The gate's put ask carries no `track`.** `#putGate` never read the answer's `tracked`, and the gate has no root
  box to track. A loosening only on paper; it goes in the changeset.
* **`Bank.make` refuses the shell as a root box.** A bank without a stored root is damaged; there is no unborn
  `Bank` any more.

Nothing changes what is stored, what a lease or wayin binds, or which refusals a form verb can meet.

## The threads

A line, the second stacked on the first.

1. **`gate_holds`**: everything in *The shape* but the birth: a Thing as one life, `Gate` with `#adopt`, the moves
   out of `Bank`, the gatings taking a gate, `LeaseGate`, the snapshot through `gate.subscribe`, the callsites
   (vault.ts's `ensureUnlocked`, `isLocked` and `demandEnabled`, the device's `lock` and `sweep`, safebyok-react-lean's
   giver and kit and their tests, and the React demo where it calls the new core), VOCABULARY's gate, lease, gating,
   proving and Thing entries, `notes/security.md` through its subagent (the lease is granted to the gate; G9 holds
   unchanged), and a changeset. `Bank` still makes its gate in its constructor here, from `record.maingate`, so
   `Device.#bringUp` waits for thread 2. Large, mostly moves: `thread-worker-400k` on `opus`, a `high` review on `opus` (it touches the lease and G9).
2. **`bank_whole`**: the birth reshaped as above, `Bank.make` taking the gate, `rootBox` readonly and live,
   `BankMakeRecord`, `BankDna` and `BirthOpts` reshaped, `Device.#bringUp`, spyBirths and the device tests' "later"
   banks. Medium: `opus`, a `medium` review.

## Open matters, for turbochat

1. **Where a caller calls a gate verb.** I recommend the verbs and makers live on `Gate` alone
   (`bank.gate.unlockGating(…)`), and `Bank` keeps one-line delegators only for what a vault or a host's screen uses
   without caring how a user gets in: `lock`, `ensureUnlocked`, `dismissUnlock`, `isLocked`, `isUnlocked`, and
   `Bank.birth` / `Bank.birthGating`, since a host births a bank. Alternatives: delegators for every verb, or none.
2. **The birth's maker.** It must be minted inside `Gate`, since its friend reaches the gate's privates. I recommend
   `Gate.birthGating` as the maker, with `Bank.birthGating` and `Bank.birth` as the delegators of 1.
3. **How `Bank`'s box verbs reach the lease.** I recommend public `gate.seal(sealer, donor, publicProps,
   secretProps)` and `gate.unseal(sealer, record)`, which demand the gate unlocked and call the lease: the lease stays
   private to the gate, and `Bank` keeps the own-box check and the asks. They give a caller no power `bank.sealBox`
   and `bank.unsealBox` do not already give; the ctx binds the bank's stamp either way. The alternative, a friend the
   gate hands its bank, needs the bank to adopt the gate after both are made, which brings back the half-made object.
4. **The gate's change signal.** I recommend `gate.subscribe` alone, with no snapshot of its own: one listener, its
   bank, whose `#align` compares snapshots anyway. A `GateSnapshot` waits until something renders a gate apart from
   its bank.
