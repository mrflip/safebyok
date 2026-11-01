---
"safebyok": minor
---

The models' vault record and lease record gain `gate_epoch`, which each change of the gate moves by one. A lease refuses 'gate_moved' once its vault's epoch has moved, and is counted as none at the next load; a vault unlocked locks on a change heard from another device, and stays unlocked on its own, under a new lease. A stored vault or lease record without the field fails validation, as any older shape does.
