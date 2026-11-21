# Sprint gate_super

* **Date**: 2026-11-21. **Mode**: normal. **Issued by**: the Coach, in chat.
* **Levels** (defaults): review `medium`; worker `thread-worker` on its own model (inherits `opus`); reviewer
  `thread-reviewer` on its `sonnet` pin; style pass `style-reviewer` on its `sonnet` pin.
* **At once**: 3 (the line is two threads, stacked, so one runs at a time).
* **Design**: `gate_super-design.md`, beside this file. It wins over this plan on the shape of the code.
* **Status**: planned; thread 1 starting on the open matters' recommendations, provisionally.

## Read first

* `gate_super-design.md`, whole: it is short, and it is the thread's spec.
* STYLE.md *Naming*, and *Comments and doc blocks* before writing a doc block; *Tests* before writing a test.
* VOCABULARY.md: the rows for **gate**, **gating**, **proving**, **lease**, **wayin**, and *Shapes*' **Thing**.
* `notes/wontfix.md`, its header, before adding a row.

## Ground rules

* **A Thing is one life, not one revision** (the Coach, 2026-11-21). "It's actually meant to be one **life** of a
  stored thing; [...] Box is not contemplated to be replaced on every saved change to a sidecar field." thing.ts's doc
  block and its fixed fields change to match.
* **One `Gate` class.** "There remains just the class Gate, and its properties update when the mutation returns. Use
  the private method `#adopt` to set updated props and private vars as they arrive. Don't implement anything extra
  around a change in behavior at life change yet." (the Coach, 2026-11-21). No `GateRevision`, no second class.
* **The open matters are provisional.** The design's four open matters are with the Coach in the sprint doc. Build to
  each **Rec**; a ruling that differs reaches you as a directive. Keep what a ruling could change (the delegators on
  `Bank`, `gate.seal` / `gate.unseal`, `gate.subscribe`) in small, separate commits so a reversal is cheap.
* **No crossing guards** (`#no-slop-crossings`). A gating reads what it needs of the gate before its first await, as
  it does today; nothing more guards a gate change landing mid-gating. A crossing you notice is a `notes/wontfix.md`
  row, not code.
* **The lease's ctx bytes do not change.** The lease reads `gate.bankStamp` where it read `bank.stamp`;
  tests/models/ctx-bytes.test.ts passes unchanged. Nothing changes what is stored.
* **Callers outside the core** are `safebyok-react-lean` (its giver and kit, and their tests) and the React demo
  where it calls the new core. `safebyok-react` and the adapters build on `safebyok-big`: leave them.
* **Check with your orchestrating agent before fanning out** to subagents beyond the ones your agent file names.

## Threads

### 1. gate_holds

> Gate superintends gating: most of what is on Bank moves to Gate, the one Gate class, whose props update through
> `#adopt` when a gate write returns; Lease goes to Gate, with Bank delegating. (The Coach, 2026-11-21, condensed from
> chat; the design's *The shape* and *Threads* item 1 are the spec.)

*Gloss.* Everything in the design's *The shape* but the birth: thing.ts as one life with a protected way to adopt a
newer record; `Gate` gains `#adopt`, the lease, the awaited `unlock` gating, the form verbs and makers, `#putGate`,
`#unlockByProving`, `lock`, `sweep` and its guards, `seal` / `unseal`, `subscribe`; `Bank` keeps its Things and
delegates (Rec 1); the gatings in models/gating.ts take a gate; `LeaseGate` replaces `LeaseBank`; the bank's
snapshot reads the gate. `Bank` still makes its gate in its constructor from `record.maingate`, with
`Gate.make(record, { device, vaultDB, bankStamp })`, so `Device.#bringUp` and the birth's order stay as they are.
Touches models/bank.ts, gate.ts, gating.ts, lease.ts, thing.ts, vault.ts, device.ts (lock and sweep only),
shapes-gateish.ts, shapes-bankish.ts, core.ts exports, their tests, safebyok-react-lean, the demo, VOCABULARY,
`notes/security.md` (through its subagent: the lease is granted to the gate; G9 holds), a changeset.
*Levels*: worker `thread-worker-400k` (`opus`); review `high`, reviewer on `opus`; style pass `opus` (it renames and
rewrites vocabulary rows). *Depends on*: nothing; cut from `origin/main`. *Look-ahead*: thread 2 makes the gate
before the bank, so `Gate.make` must need no `Bank`, and `Bank.birthGating`'s friend should already go through a
static on `Gate` (Rec 2) if that falls out naturally; leave the birth's order otherwise. *Size*: large, mostly moves.

### 2. bank_whole

> The weird liminal gate-then-bank creation goes: a Bank fully constructs. (The Coach, 2026-11-21, condensed; the
> design's *The two ways a Bank is made* and *Threads* item 2 are the spec.)

*Gloss.* The birth makes the gate first, unlocks it, seals the root with `gate.seal`, stores, and only then makes the
`Bank` from the records stored and hands it to `device.adoptBornBank`; a refused birth sweeps the gate.
`Bank.make(record, { device, vaultDB, gate })`, `rootBox` readonly and always live, the shell refused;
`BankMakeRecord`, `BankDna`, `BirthOpts` reshaped; `Device.#bringUp` makes the gate, then the bank; spyBirths and the
device tests' "later" banks. *Levels*: defaults. *Depends on*: thread 1, stacked on its branch once it is ready.
*Size*: medium.

## For the Coach

* The four open matters are in the sprint doc's *Open Matters*. Thread 1 builds to their recommendations meanwhile.
