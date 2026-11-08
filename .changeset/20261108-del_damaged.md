---
"safebyok": minor
"safebyok-react": minor
"safebyok-indexeddb": minor
"safebyok-postgres": minor
"safebyok-convex": minor
"safebyok-graphql": minor
---

**Damaged box rows have their own delete: a custom adapter implements `doDelDamagedBox`, and `vaultDB.delBox` no longer clears a damaged row.** `vaultDB.delDamagedBox(tombstone, boxprops)` and `tryDelDamagedBox` take the stored row back as `boxprops`, and the store deletes it, in one transaction, only where it stands exactly so, fails a box row's check with extra fields forgiven, and is of a format this copy of safebyok reads; each of those misses refuses `damaged_row`. `delBox` over a damaged row refuses `damaged_row` too. Each `damaged_rows` entry of `listBoxes` gains `boxprops`, the row as stored. A Convex host exports `delDamagedBox` from its `SafebyokComponent` api beside `delBox`. `vault.tryDelDamagedBox` answers as before, except that a row whose only fault is extra fields, or whose `fmt` is newer, stays listed and answers `damaged_row`.
