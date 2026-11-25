---
"safebyok-convex": minor
---

A safebyok-convex watch now carries only what changed: `watchThings` takes `{ scope, cursor }` and returns `{ things, bank, cursor }`, the Things of the bank committed after the cursor, and the watch subscribes again from each new cursor, still on Convex's reactive query, with nothing polling. Re-export `watchThings` from your `convex/safebyokVault.ts` as before; its arguments change with the client's. The component's `things` documents gain a required `commit_ts`, Convex's commit timestamp, indexed `by_commit`: a deployment that already holds safebyok documents refuses the schema push until the component's `things` table is emptied, which each user's bank then reads as absent. There is no migration before 1.0.0.
