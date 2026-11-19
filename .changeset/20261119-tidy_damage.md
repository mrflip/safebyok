---
"safebyok-convex": minor
"safebyok-indexeddb": minor
---

tidyGone never takes a damaged row for one of an ended life: a bank row that fails the core's checks makes it refuse damaged_row and delete nothing (Convex's watch reports the same to onBadNews), and a vault row that fails them is kept with its box rows (and, in Convex, its tally), where both used to be deleted. Convex's component now hands the client bad_scope for an ask whose scope fails its checks, where it used to read as storage_unavailable, and safebyokErrorKindVals drops damaged_vault and storage_issue, which the component never sends.
