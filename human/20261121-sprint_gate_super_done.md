# Sprint gate_super: done

The Gate now superintends a bank's gating, and a Bank is made only once its bank is stored. A Thing models one life,
not one revision, and carries the change signal (`subscribe`). `Gate` stays the one class: its props update through
`#adopt` when a gate write lands, and it holds the lease, the awaited `unlock` gating, the form verbs and their makers
(`Gate.birthGating` included), and the seal primitives. `Bank` keeps its Things, one-line pass-throughs (`lock`,
`ensureUnlocked`, `dismissUnlock`, `isLocked`, `isUnlocked`, the birth), and exactly four seal verbs (`sealBox`,
`unsealBox`, `trySealBox`, `tryUnsealBox`); anything fancier is the vault's. The birth makes one gate, unlocks it once,
seals the root under it, stores, and hands that gate to `Bank.make(record, { device, vaultDB, gate })`; a device's
`hello` makes the gate, then the bank. Nothing stored changes, nor what a lease or wayin binds.

## Merge order

The line: main → #813 → #814 → #815 → #816 → #812. Merging #812 merges them all.

* **#813**, **#814**: react_life's birth_verb and new_passphrase, below this line at the Coach's word ("would you
  mind rebasing on top of 814"). They stand on main at 0dd292ea4; main has since gained #795 (scripts only), and
  restacking them is react_life's.
* **#815** gate_holds: "Stacked on #814". Reviewed twice (high, then the rework at medium), both fixed.
* **#816** bank_whole: "Stacked on #815". Reviewed at medium, fixed.
* **#812** the sprint PR: the plan, design, progress, resolutions and this note.

No YOLO decisions. The Coach's rulings and my calls are in `whiteboard/20261121-gate_super/gate_super-resolutions.md`.

## Still open

In the sprint doc's *Open Matters* (https://claude.ai/artifact/QXN2XWNRYQG1e3WjwCijS5), each with a Rec:

* **Whose refusal a swept bank's waiters meet** (#815): `gate.sweep(endCause?)` takes the bank's cause, so
  `bank.ensureUnlocked` still rejects with the bank's `endCause`; built that way.
* **The VOCABULARY bank row** (#815): the Coach's row still says the bank "orchestrates all gating events".
* **A host sweeping the gate directly** (#815 review): the bank then reads `locked`, not `swept`.
* **Part of the old seal on Gate** (#815 review): `Object.preventExtensions(this)`, or leave it unfrozen as built.
* **No put that waits for the unlock** (#815): `sealBoxEnsuringUnlock` went with no caller.
* **A first step for the startup redesign** (#816): `#bringUp` casts the minder's three records and builds inline;
  the swept phrases still say "make it again with Bank.make".
