---
"safebyok": minor
---

A new refusal kind, `record_conflict` (a condition), joins `refusalKindVals`: storage and this device disagree about one revision of a record. This device keeps its own copy; fetching the record again finds the same disagreement until what storage holds changes, so the app tells the user, and a developer looks at the storage adapter. No exported call refuses with it yet; a host that switches over every refusal kind exhaustively needs a case for it.
