# gate_super: resolutions

The Coach's rulings and the orchestrator's calls, newest batch first.

## Rulings

### The seal wrappers' names, corrected

* Matter: the Coach's correction replacing the ruling on the seal wrappers' names below.
* Coach, in chat, replacing the line above: "any sugar or orchestration around unsealing: put that on vault where it already is/was/will be; Use gate to offer primitives (seal / unseal), bank has passthrough seal/unseal and wrapped trySeal/tryUnseal, vault has withWhisper and anything fancier than the four bank methods"
* Date: 2026-11-21
* Asked: in chat, on #815
* Went to: #815's rework

### Merge #813 before #815

* Matter: Rec was to merge #813 first, rebase #815 onto it, and cut thread 2 from there.
* Coach, in chat: "I think 813 is ready to go or nearly, would you mind rebasing on top of 814 and starting -- anything still to come is not likely to be disruptive"
* Date: 2026-11-21
* Asked: in chat, on #815
* Went to: #815 rebases onto #814 (which carries #813) after its review; thread 2 is cut from that tip.

### The seal wrappers' names

* Matter: Rec was to keep Bank's box names (`trySealBox`, `sealBoxEnsuringUnlock` and the rest) over `gate.seal` / `gate.unseal`. Replaced by the correction above.
* Coach, in chat: "any sugar or orchestration around unsealing: put that on bank for the moment; leave gate to hold primitives (seal / unseal), bank has passthrough seal/unseal/trySeal/tryUnseal"
* Date: 2026-11-21
* Asked: in chat, design open matter 3, on #815
* Went to: #815's rework

### How Bank hears of gate changes

* Matter: Rec was `gate.subscribe` alone, the bank its one listener.
* Coach: "build this into Thing if it isn't"
* Date: 2026-11-21
* Asked: design open matter 4
* Went to: thread 1

### How Bank's box verbs reach the lease

* Matter: Rec was public `gate.seal` and `gate.unseal`, the lease private to the gate.
* Coach: "bank serves seal, unseal with trySeal / tryUnseal wrappers / bank also deserves sealEnsuringUnlock and unsealEnsuringUnlock which it might have-- issues the unse"
* Date: 2026-11-21
* Asked: design open matter 3
* Went to: thread 1; the names went back as a new row.

### Who makes the birth's gating

* Matter: Rec was `Gate.birthGating`, with `Bank.birthGating` and `Bank.birth` passing through.
* Coach: "it's well possible that gate will need to accept a friend and then re-expose on a gating friend. If you do, make them honest methods of gate: `#gateFriend() { return { hypotheticalBankMethod: () => this.#hypotheticalBankMethod() } }` `#hypotheticalBankMethod() { return this.bankFriend.hypotheticalBankMethod() }`"
* Date: 2026-11-21
* Asked: design open matter 2
* Went to: threads 1 and 2

### Where callers reach the gate verbs

* Matter: The verbs move to the Gate (`bank.gate.unlockGating(…)`); Rec was that Bank keeps one-line pass-throughs only for `lock`, `ensureUnlocked`, `dismissUnlock`, `isLocked`, `isUnlocked` and the birth.
* Coach: "one-line pass-throughs"
* Date: 2026-11-21
* Asked: design open matter 1
* Went to: thread 1, as a directive

## Calls left to the orchestrator

These are the orchestrator's calls, not the Coach's rulings: they needed no decision from the Coach.

### Bank.make does not check its gate's device

* Matter: Bank.make does not check its gate's device.
* Orchestrator's call: Left: the stamp check catches the likely mistake, and both callers make the gate on the spot.
* Lands in: #816

### A tombstone's sidecar is caught only at runtime

* Matter: A tombstone's sidecar is caught only at runtime.
* Orchestrator's call: Left until the seal surface is next reshaped: narrowing sealBox's catch-all overload changes the public overload set.
* Lands in: later

### VOCABULARY's seal bullet lists call paths

* Matter: VOCABULARY's seal bullet lists call paths.
* Orchestrator's call: Trim it to what sealing is; the call paths stay in doc blocks.
* Lands in: thread 2

### Which refusal comes first in sealBox

* Matter: Which refusal comes first in sealBox.
* Orchestrator's call: Kept thread 1's order: another bank's box refuses record_conflict before a locked bank refuses bank_locked; no test pinned the old order.
* Lands in: #815

### The startup fix thread 1 proposes

* Matter: The startup fix thread 1 proposes.
* Orchestrator's call: Thread 2 as designed: the birth hands its gate to Bank.make, #bringUp makes the gate first; that removes thread 1's double unlock and throwaway gate.
* Lands in: thread 2

### The gate's write carries no `track`

* Matter: The gate's write carries no `track`.
* Orchestrator's call: Dropped: nothing read the answer's `tracked` there; the changeset says so.
* Lands in: thread 1

### Thread names

* Matter: Thread names.
* Orchestrator's call: Thread 1 is `gate_holds`, since the sprint itself is `gate_super`.
* Lands in: the plan
