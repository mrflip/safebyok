---
"safebyok": minor
---

The models' vault record and lease record gain `gate_epoch`, which each change of the gate moves by one. A lease refuses 'gate_moved' once its vault's epoch has moved, and is counted as none at the next load; a vault unlocked stays unlocked through its own change, under a new lease. A stored vault or lease record without the field fails validation, as any older shape does.
