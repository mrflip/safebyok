# Thread 1: gate_holds (2026-11-21)

Branch `20261121-gate_holds`, PR [#815](https://github.com/mrflip/safebyok/pull/815), on main (0dd292ea4, #811).
Proved: safebyok 1357 tests, safebyok-react-lean 251 tests, typecheck and lint of both; `pnpm justify` after the
catch-up (see the PR's **Tests:** line).

* **Built**:
  - `models/thing.ts`: a Thing models one *life*. The fields fixed for a life stay non-configurable; `fmt`, `revtok`,
    `revseq`, `written_at` and `am` are set again by a protected `adoptRecord(record)`, which checks nothing about the
    life. Thing also carries the change signal (ruling 4): a bound `subscribe`, a protected `tellSubscribers(onThrow)`
    and a protected `dropSubscribers()`. BaseBox inherits them and never tells.
  - `models/gate.ts`: the one `Gate` class holds `#lease`, `#attachLease`, `lock`, `isLocked`/`isUnlocked`,
    `leaseEndsAt`, the awaited `unlock` gating (`ensureUnlocked`, `dismissUnlock`, `isUnlockWanted`), the form verbs
    and their makers and try twins, static `Gate.birthGating`, `#unlockByProving`, `#putGate` (which calls `#adopt`),
    `sweep(endCause?)` with `isEnabled`/`endCause`/`demandEnabled`, and `seal`/`unseal` under its lease. It no longer
    freezes itself. `Gate.make(record, { device, vaultDB, bankStamp })` needs no Bank; `Gate.makeNextRecord(cited,
    wayins)` is static and takes the cited record.
  - `models/gating.ts`: `Gating<ResolvedT = unknown>`; the gate gatings resolve the Gate, the birth the Bank. Each gate
    change reads its `Ante` (the record it cites, its stamps, its Wayin objects) before its first await.
  - `models/bank.ts`: keeps its Things, the snapshot (reading the gate), the asks, `put`, the box verbs, `hostVault`,
    `sweep` (gate, then vaults). One-line pass-throughs: `lock`, `ensureUnlocked`, `dismissUnlock`, `isLocked`,
    `isUnlocked`, `Bank.birthGating`/`birth`/`tryBirth`. `bank.gate` replaces `bank.maingate`. New (ruling 3, own
    commit): `trySealBox`, `tryUnsealBox`, `sealBoxEnsuringUnlock`, `unsealBoxEnsuringUnlock`.
  - `models/lease.ts`, `proving.ts`: the lease is granted to a `LeaseGate` (`Pick<Gate, 'bankStamp' | 'lock' |
    'isEnabled' | 'demandEnabled'>`), reading `gate.bankStamp`; ctx-bytes.test.ts passes unchanged.
    `proving.buildLease(gate, cited)`.
  - Shapes: `GateGatingFriend` (was `BankGatingFriend`), `BirthGatingFriend` is now `{ unlockByProving(gate, proving) }`,
    `GateOpts` is `{ device, vaultDB, bankStamp }`, `GateBank` and `BirthOpts` gone, `LeaseGate` replaces `LeaseBank`.
  - Callers: safebyok-react-lean's giver makes its gatings on `bank.gate`; its tests, and the knockknock and envman
    demos' tests, unlock through `bank.gate`. demos/safebyok-demo-react calls only safebyok-react (big): untouched.
  - Tests: tests/models/bank-forms.test.ts is now gate-forms.test.ts (the form verbs are the gate's); gate.test.ts
    gains the gate's own surface (fixed life fields, subscribe, seal/unseal, sweep's end cause); bank.test.ts gains the
    four new box verbs.
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
  - **Box verbs**: `sealBox`/`unsealBox` demand the bank enabled and the box its own, then `gate.seal`/`gate.unseal`
    demand the gate unlocked. So a locked bank handed another bank's box now refuses `record_conflict` before
    `bank_locked`; no test pinned the old order.
  - **The gate's put ask** is `putAskOf(ask)` with no `track` and no bank scope spread.
  - **Thing fields**: only the revision fields are re-definable; the life's stay non-configurable, so nothing outside
    can redefine `userid` or `lifeseq` though the gate is not frozen.
* **Deviations**:
  - **The birth's steps are reordered, to keep G9 without a new private channel** (pulled from thread 2, in part). With
    the lease on the gate, the birth must unlock a gate privately; `Gate.birthGating` mints the one friend
    (`unlockByProving(gate, proving)`, ruling 2). Body (gating.ts `birthBank`): `Gate.make` from the new record, unlock
    it, `gate.seal` the root over its shell, `tryBirthBank`, then `Bank.make` from the records stored, unlock *that*
    bank's own gate by the same proving, sweep the birth's gate (in a `finally`), `device.adoptBornBank`. So the Bank is
    made only once stored, its `#rootBox` is now `readonly`, there is no root swap, and spyBirths' `lockedAtBirths` is
    gone. Untouched: `Device.hello`/`#bringUp`, `Bank.make` making its own gate, `adoptBornBank`. Set aside: keeping
    Bank-first (needs both a gate private reached from Bank and a Bank private reached from the birth), a public
    `gate.attachLease`, a static-block friend.
  - **Small commits**: Thing's one life, and the box verbs of ruling 3, are their own commits. The pass-throughs,
    seal/unseal and the subscribe move are inside the main move: splitting them would need intermediate code that
    compiles, which costs more than a reversal would.
* **Discoveries**:
  - VOCABULARY's **bank** row (the Coach's) still says the bank "orchestrates all gating events": that is the gate's
    now. Left as is, for the Coach.
  - The birth's double unlock (birth gate, then the bank's gate) is the price of `Bank.make` still making
  its own gate; thread 2's `Bank.make(record, { …, gate })` deletes it.
* **For the Coach** (Open matters):
  - **Startup fix**: make the birth hand its gate to `Bank.make(record, { device, vaultDB, gate })` and have
    `Device.#bringUp` make the gate from the minder's record first (thread 2 as designed). That removes the second
    unlock and the throwaway gate.
  - **gate.sweep(endCause)**: keep the optional cause (above), or let a waiter on a swept bank reject with the gate's own
    refusal and change `bank.ensureUnlocked`'s contract.
