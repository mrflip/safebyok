# Sprint gate_super

* **Date**: 2026-11-21. **Mode**: normal. **Issued by**: the Coach, in chat.
* **Levels** (defaults): review `medium`; worker `thread-worker` on its own model (inherits `opus`); reviewer
  `thread-reviewer` on its `sonnet` pin; style pass `style-reviewer` on its `sonnet` pin.
* **At once**: 3 (the line is two threads, stacked, so one runs at a time).
* **Design**: `gate_super-design.md`, beside this file. It wins over this plan on the shape of the code.
* **Sprint doc**: https://claude.ai/artifact/QXN2XWNRYQG1e3WjwCijS5 (doc be7f75cf-e738-4c41-a935-e38fb389206e; Open Matters tab c8cbcdee-b8dd, body 2b3e8042-eb8b, State enum 746f6e46-9377, bookmark rev 647; Cleanup body 066fec2e-3b24; Progress body f5db6e4e-26ef; Resolved body 8456c1e0-084a).
* **Status**: done. Line main → #813 → #814 → #815 → #816 → #812, every PR filed and ready; six matters still open in the doc (human/20261121-sprint_gate_super_done.md).

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
* **The open matters are ruled** (the Coach, 2026-11-21; *Resolved* in the sprint doc has the words):
  1. The verbs and makers live on `Gate`; `Bank` keeps one-line pass-throughs for `lock`, `ensureUnlocked`,
     `dismissUnlock`, `isLocked`, `isUnlocked`, and the birth.
  2. `Gate.birthGating` makes the birth's gating. A bank capability the gate needs comes through a friend it is
     given, and the gating's friend closes over the gate's own private methods, each an honest method calling that
     friend: `#gateFriend() { return { m: () => this.#m() } }`, `#m() { return this.bankFriend.m() }`.
  3. `gate.seal` / `gate.unseal` underneath; `Bank` serves `sealBox` / `unsealBox` with `trySealBox` /
     `tryUnsealBox`, and `sealBoxEnsuringUnlock` / `unsealBoxEnsuringUnlock`, which await `ensureUnlocked()` first.
     Superseded in chat (the Coach, 2026-11-21, correcting a first wording): "any sugar or orchestration around
     unsealing: put that on vault where it already is/was/will be; Use gate to offer primitives (seal / unseal), bank
     has passthrough seal/unseal and wrapped trySeal/tryUnseal, vault has withWhisper and anything fancier than the
     four bank methods". Then: "trySealBox and tryUnsealBox are better". So `Bank` has exactly `sealBox`, `unsealBox`,
     `trySealBox`, `tryUnsealBox`, passing through to `gate.seal` / `gate.unseal`; the asks `sealBox` built today,
     `tombstoneBox` and the `…EnsuringUnlock` pair go to `Vault` or go.
  4. The change signal is built into `Thing`: `subscribe`, bound, and a protected way to tell subscribers; `Gate` and
     `Bank` both use it.
* **No crossing guards** (`#no-slop-crossings`). A gating reads what it needs of the gate before its first await, as
  it does today; nothing more guards a gate change landing mid-gating. A crossing you notice is a `notes/wontfix.md`
  row, not code.
* **The lease's ctx bytes do not change.** The lease reads `gate.bankStamp` where it read `bank.stamp`;
  tests/models/ctx-bytes.test.ts passes unchanged. Nothing changes what is stored.
* **Callers outside the core** are `safebyok-react-lean` (its giver and kit, and their tests) and the React demo
  where it calls the new core. `safebyok-react` and the adapters build on `safebyok-big`: leave them.
* **Startup is next for redesign** (the Coach, 2026-11-21): "the startup sequence is all intertwingled and next for
  redesign; if it looks wrong it probably is, propose a fix rather than heroics." Where `Device.hello` / `#bringUp`,
  `Bank.make`'s order or `device.adoptBornBank` fights the work, change it as little as gets the thread green, and
  write the proposed fix as an open matter.
* **The line sits on react_life's** (the Coach, 2026-11-21): "would you mind rebasing on top of 814 and starting".
  #815 rebases onto #814 (`20261121-new_passphrase`, which carries #813's `device.birthGating`); its PR says
  "Stacked on #814", its base stays `main`.
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

*Review:* fixed (high, opus). Fixes: `Gate.make` refuses a device of another scope; `gate.sweep`'s doc; Thing picks
fields by destructuring; `countCalls` through TH; proving.test.ts names. Left, minor: a host may sweep the gate
directly (row); the birth's post-store window (thread 2 narrows it); an orphaned lease if `adoptBornBank` throws (as
main); Gate unfrozen (row, `preventExtensions`); `gate.device` / `gate.vaultDB` public; `Lease.sweep`'s doc;
`adoptBornBank` replacing a held bank (pre-existing). *Rework:* rebased onto #814; Bank's four seal verbs, the rest on
Vault. *Second review:* fixed (medium, opus): the vault's Boxes comment and `#sealedAsk`'s doc. Left: a tombstone's
sidecar caught only at runtime (later); VOCABULARY's seal bullet (thread 2 trims it).

### 2. bank_whole

> The weird liminal gate-then-bank creation goes: a Bank fully constructs. (The Coach, 2026-11-21, condensed; the
> design's *The two ways a Bank is made* and *Threads* item 2 are the spec.)

*Gloss.* The birth makes the gate first, unlocks it, seals the root with `gate.seal`, stores, and only then makes the
`Bank` from the records stored and hands it to `device.adoptBornBank`; a refused birth sweeps the gate.
`Bank.make(record, { device, vaultDB, gate })`, `rootBox` readonly and always live, the shell refused;
`BankMakeRecord`, `BankDna`, `BirthOpts` reshaped; `Device.#bringUp` makes the gate, then the bank; spyBirths and the
device tests' "later" banks. *Orchestrator:* thread 1 already made the birth gate-first (a gate of its own, a
second unlock of the bank's gate, `rootBox` readonly, `BirthOpts` gone); thread 2 hands the birth's gate to
`Bank.make` and has `#bringUp` make the gate, deleting the double unlock. Cut it after #813 merges, on
`device.birthGating`. *Levels*: defaults. *Depends on*: thread 1, stacked on its branch once it is ready.
*Size*: medium.

*Review:* fixed (medium, opus): `makeStoredGate` renamed to match `TH.makeStoredBank`, whose doc says what the bank
is; the changeset names what the birth checks of the answer (orchestrator). Left, minor: a throw from `attachBank`
leaves the device a bank whose gate is swept (a broken state, reported by the throw); `Bank.make` checks only the
gate's stamp (my call, on *Cleanup*). Filed as #816 at aa01109f6.

## For the Coach

* The four open matters are in the sprint doc's *Open Matters*. Thread 1 builds to their recommendations meanwhile.
