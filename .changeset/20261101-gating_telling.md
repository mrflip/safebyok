---
"safebyok": minor
---

**`refusalKindVals` gains `declined`, a condition**: a gating of the coming vault models that the user declined, or whose dialog closed with it still open. Nothing was unlocked or changed. The core's exported calls do not throw it yet; a host that maps every `RefusalKind` to a message (or switches on one exhaustively) gains a case to cover. **Stored format:** unchanged.
