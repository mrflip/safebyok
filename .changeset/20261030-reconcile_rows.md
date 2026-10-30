---
"safebyok": minor
---

A new refusal kind, `record_conflict` (a condition), joins `refusalKindVals`: storage and this device hold one revision of a record and disagree about it, so neither copy can be trusted until it is fetched again. No exported call refuses with it yet; a host that switches over every refusal kind exhaustively needs a case for it.
