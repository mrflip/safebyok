---
"safebyok-big": minor
"safebyok-convex": minor
"safebyok-postgres": minor
"safebyok-indexeddb": minor
---

A vaultDB's puts and deletes now judge the row they land over by its full check: a row that fails it (a newer format among them) answers damaged_row and stands, and a box tidy keeps the boxes under a vault row that fails it. In safebyok/storage, isCheckedLiveVault is renamed isLiveVaultRecord, isLiveBoxRecord and the put checks isVaultPutAllowed and isBoxPutAllowed are added, and isLiveRowUnder is removed: a custom adapter calls those two put checks from doPutVault and doPutBox, and isLiveBoxRecord or isLiveVaultRecord from its deletes, in place of isLiveRow.
