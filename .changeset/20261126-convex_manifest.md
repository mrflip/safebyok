---
"safebyok-convex": minor
---

safebyok-convex stores each kind of Thing in a table of its own, bank_things, gate_things and box_things, a field for each of the Thing's fields, in place of the one table things. There is no migration: a host's existing Convex vaults read as absent; clear the things table on the dashboard before deploying, since Convex will not drop a table that has rows. Each of the component's functions now hands back a manifest of what it observed (notes/vault-adapter-contract.md), so their return types change. A component and client that disagree on whether a write was stored now refuse storage_issue, not unexpected_error.
