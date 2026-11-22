# Sprint gate_super: progress

What the threads have taught, newer than the plan where they disagree.

## Before the threads

* Main at 0dd292ea4 (#811) already has the device bringing up its own bank (`Device.hello` → `#bringUp`, which
  makes the `Bank` from the minder's three records) and the birth handing its bank over (`device.adoptBornBank`,
  marked as a react_life cheat). `cheatHoldBank` is gone, so a refused birth no longer leaves a bank on the device.
* The React package on the new core is `safebyok-react-lean`; it calls `bank.unlockGating` and the other makers,
  `Bank.birthGating`, `bank.dismissUnlock`, and reads `isUnlockWanted` from the snapshot.
