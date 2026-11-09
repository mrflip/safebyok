# Thread 1: conditional writes judge a validated row (2026-11-09)

Branch `20261109-validated_writes`, stacked on #610. In progress.

* **Built**: `isLiveVaultRecord`, `isLiveBoxRecord`, `isVaultPutAllowed`, `isBoxPutAllowed` in `shapes-storage.ts`; every adapter's `doPut*` and `doDel*` use them; `isLifeOver` keeps the boxes under a vault row failing `vaultRow`; `Listing.del` lost its damaged-duck branch.
