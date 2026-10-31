---
---

Nothing ships: nothing under src/models/ is exported from src/index.ts. The model vault record now carries its gate (`gate`, its wayins), built before the record is born and never null; `Gate` and `Proving` bind a vault's stamp rather than the vault, and `proving.makeLease(vault, dbfriend, opts)` takes the vault at the grant. No stored vault of the released package is touched.
