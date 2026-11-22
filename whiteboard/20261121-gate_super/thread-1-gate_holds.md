# Thread 1: gate_holds (2026-11-21)

Branch `20261121-gate_holds`, PR [#815](https://github.com/mrflip/safebyok/pull/815), stacked on #814
(`20261121-new_passphrase` at 604772d6f, itself on #813, react_life's birth_verb); the PR's base stays `main`. `sprintbasebranch` is
`origin/20261121-new_passphrase`. Proved: see the PR's **Tests:** line.

**Rework after the review (2026-11-21).** The reviewed tip f5051e945 was rebased onto #814 (it is f093593bd now); two
commits follow it, the seal surface and its docs. A second review need read only those and the rebase's resolution
(below, *Rebase onto #814*).

* **Built**:
  - `models/thing.ts`: a Thing models one *life*. The fields fixed for a life stay non-configurable; `fmt`, `revtok`,
    `revseq`, `written_at` and `am` are set again by a protected `adoptRecord(record)`, which checks nothing about the
    life. Thing also carries the change signal (ruling 4): a bound `subscribe`, a protected `tellSubscribers(onThrow)`
    and a protected `dropSubscribers()`. BaseBox inherits them and never tells.
  - `models/gate.ts`: the one `Gate` class holds `#lease`, `#attachLease`, `lock`, `isLocked`/`isUnlocked`,
    `leaseEndsAt`, the awaited `unlock` gating (`ensureUnlocked`, `dismissUnlock`, `isUnlockWanted`), the form verbs
    and their makers and try twins, static `Gate.birthGating(device, cleartexts, attachBank?)`, `#unlockByProving`, `#putGate` (which calls `#adopt`),
    `sweep(endCause?)` with `isEnabled`/`endCause`/`demandEnabled`, and `seal`/`unseal` under its lease. It no longer
    freezes itself. `Gate.make(record, { device, vaultDB, bankStamp })` needs no Bank; `Gate.makeNextRecord(cited,
    wayins)` is static and takes the cited record.
  - `models/gating.ts`: `Gating<ResolvedT = unknown>`; the gate gatings resolve the Gate, the birth the Bank. Each gate
    change reads its `Ante` (the record it cites, its stamps, its Wayin objects) before its first await.
  - `models/bank.ts`: keeps its Things, the snapshot (reading the gate), the asks, `put`, the box verbs, `hostVault`,
    `sweep` (gate, then vaults). One-line pass-throughs: `lock`, `ensureUnlocked`, `dismissUnlock`, `isLocked`,
    `isUnlocked`, `Bank.birthGating`/`birth`/`tryBirth`. `bank.gate` replaces `bank.maingate`. Exactly four seal verbs
    (the Coach's final ruling): `sealBox` and `unsealBox`, passing through to `gate.seal(BaseBox, …)` and
    `gate.unseal(BaseBox, …)` behind the own-box check, and their Outcome twins `trySealBox` and `tryUnsealBox`.
    `sealBox` resolves the sealed record.
  - `models/vault.ts`: a private `#sealedAsk` builds the put ask (or the del ask, for a tombstone) from `bank.sealBox`'s
    record, citing the donor sparse, through `bank.makePutAsk`/`makeDelAsk`. `tryPutBoxOnce` and `tryDelBoxOnce` (which
    seals `{ am: 'x' }`) use it. `SealedBoxAsk` is gone.
  - `models/lease.ts`, `proving.ts`: the lease is granted to a `LeaseGate` (`Pick<Gate, 'bankStamp' | 'lock' |
    'isEnabled' | 'demandEnabled'>`), reading `gate.bankStamp`; ctx-bytes.test.ts passes unchanged.
    `proving.buildLease(gate, cited)`.
  - Shapes: `GateGatingFriend` (was `BankGatingFriend`), `BirthGatingFriend` is now `{ unlockByProving(gate, proving), attachBank(bank) }`,
    `GateOpts` is `{ device, vaultDB, bankStamp }`, `GateBank` and `BirthOpts` gone, `LeaseGate` replaces `LeaseBank`.
  - Callers: safebyok-react-lean's giver makes its gatings on `bank.gate`; its tests, and the knockknock and envman
    demos' tests, unlock through `bank.gate`. demos/safebyok-demo-react calls only safebyok-react (big): untouched.
  - Tests: tests/models/bank-forms.test.ts is now gate-forms.test.ts (the form verbs are the gate's); gate.test.ts
    gains the gate's own surface (fixed life fields, subscribe, seal/unseal, sweep's end cause); bank.test.ts tests the
    four seal verbs, the tombstone through `sealBox(box, { am: 'x' })`; vault.test.ts gains the put and del asks it
    writes (scope, track, cited sparse), which bank.test.ts asserted of `sealBox` before.
  - Notes: VOCABULARY's gate, lease and a new Thing row; `notes/security.md` (a new entry and two amendments, by the
    sonnet subagent); `notes/guarantees-drift.md` amends the form_verbs entry (G9: the Gate keeps the lease);
    `notes/wontfix.md` gains a row for a gate change landing while another gating unlocks; a changeset.
* **Decisions made**:
  - **The bank's end cause reaches a waiter.** `bank.ensureUnlocked`'s contract (and its tests) rejects a waiter with
    *the bank's* `endCause`. The gate cannot know its bank, so `gate.sweep(endCause?)` takes an optional cause: the bank's
    sweep passes its own; left out, it is the device's, else a new `gateSwept()` (`disabled`). Set aside: translating
    the refusal in `Bank.ensureUnlocked` (a catch in the path), or changing the contract to the gate's cause.
  - **Listener throws**: Thing's `tellSubscribers(onThrow)` takes the handler, so Bank keeps sending throws to
    `bank.tellBadNews` and Gate to `device.tellBadNews`. Set aside: an abstract `tellBadNews` on Thing (BaseBox would
    need one).
  - **The own-box check stays on Bank's pass-through**: only the bank holds the root box whose lifeseq begins each
    box's lifepath, so only it can tell a box of its own; the gate knows no root box, and without the check a box of
    another root life would seal under this bank's key. So a locked bank handed another bank's box refuses
    `record_conflict` before `bank_locked` (no test pinned the old order).
  - **What moved to Vault, and what went** (the final seal ruling): the put/del asks `sealBox` built became Vault's
    private `#sealedAsk`, used by `tryPutBoxOnce`/`tryDelBoxOnce`. `tombstoneBox` is dropped: `bank.sealBox(box,
    { am: 'x' })` seals the same tombstone, and `vault.tryDelBoxOnce` is the verb that writes one.
    `unsealBoxEnsuringUnlock` is dropped: `vault.withWhisper` already waits for the unlock, then unseals.
    `sealBoxEnsuringUnlock` is dropped with no replacement: nothing called it, and a Vault put that waits for the
    unlock would be a new verb beside `putBoxOnce` (which refuses `bank_locked`), better designed when a caller needs it.
    Set aside: a public `vault.tombstoneBox`, or a `wait` option on `tryPutBoxOnce`.
  - **Rebase onto #814** (the Coach, 2026-11-21). #813 replaced `device.adoptBornBank` with `device.birthGating
    (cleartexts)`, calling `Bank.birthGating(device, cleartexts, attachBank)` (#814 renamed its `keep`). Resolved so both
    stand: `Bank.birthGating` passes through to `Gate.birthGating(device, cleartexts, attachBank?)`, which checks
    `attachBank` (the check moved from Bank's Checks to Gate's) and hands it to the birth's body in the friend
    (`BirthGatingFriend` gains `attachBank(bank)`); `birthBank` calls `friend.attachBank(bank)` where it called
    `device.adoptBornBank`. `BirthGating extends Gating<Bank>`,
    made with `Device.birthGating`. Phrases and throwers: both `BankNotBroughtUp`/`bankNotBroughtUp` (#813) and
    `GateSwept`/`gateSwept` (here). notes/wontfix.md keeps both new rows. #813's `await device.hello()` in the try-forms
    test landed in gate-forms.test.ts by rename.
  - **The gate's put ask** is `putAskOf(ask)` with no `track` and no bank scope spread.
  - **Thing fields**: only the revision fields are re-definable; the life's stay non-configurable, so nothing outside
    can redefine `userid` or `lifeseq` though the gate is not frozen.
* **Deviations**:
  - **The birth's steps are reordered, to keep G9 without a new private channel** (pulled from thread 2, in part). With
    the lease on the gate, the birth must unlock a gate privately; `Gate.birthGating` mints the one friend
    (`unlockByProving(gate, proving)`, ruling 2). Body (gating.ts `birthBank`): `Gate.make` from the new record, unlock
    it, `gate.seal` the root over its shell, `tryBirthBank`, then `Bank.make` from the records stored, unlock *that*
    bank's own gate by the same proving, sweep the birth's gate (in a `finally`), `friend.attachBank(bank)`. So the Bank is
    made only once stored, its `#rootBox` is now `readonly`, there is no root swap, and spyBirths' `lockedAtBirths` is
    gone. Untouched: `Device.hello`/`#bringUp`, `Bank.make` making its own gate, #813's `device.birthGating`. Set aside: keeping
    Bank-first (needs both a gate private reached from Bank and a Bank private reached from the birth), a public
    `gate.attachLease`, a static-block friend.
* **Discoveries**:
  - VOCABULARY named the lease's seal and unseal `lease.sealWith`/`lease.unsealWith`, names that no longer exist; the
    rework's VOCABULARY edit uses `lease.seal`/`lease.unseal`.
  - VOCABULARY's **bank** row (the Coach's) still says the bank "orchestrates all gating events": that is the gate's
    now. Left as is, for the Coach.
  - The birth's double unlock (birth gate, then the bank's gate) is the price of `Bank.make` still making
  its own gate; thread 2's `Bank.make(record, { …, gate })` deletes it.
* **For the Coach** (Open matters):
  - **No waiting put verb**: `sealBoxEnsuringUnlock` went with no replacement (above); recommend none until a caller
    needs a vault put that waits for the unlock.
  - **Startup fix**: make the birth hand its gate to `Bank.make(record, { device, vaultDB, gate })` and have
    `Device.#bringUp` make the gate from the minder's record first (thread 2 as designed). That removes the second
    unlock and the throwaway gate.
  - **gate.sweep(endCause)**: keep the optional cause (above), or let a waiter on a swept bank reject with the gate's own
    refusal and change `bank.ensureUnlocked`'s contract.
