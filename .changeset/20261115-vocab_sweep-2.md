---
"safebyok-convex": minor
---

**`SafebyokErrorData` is now `SafebyokRefusal`**, its validator `safebyokErrorData` is now `safebyokRefusal`, and its guard `isSafebyokErrorData(data)` is now `isSafebyokRefusal(val)`, all exported from `safebyok-convex/server`. Each describes the same refusal a `ConvexError` carries in its `data`, and behaves as before. A host that imports one of the old names must rename it.
