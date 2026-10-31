---
---

Nothing ships: nothing under src/models/ is exported from src/index.ts, and the additions to shapes/fields.ts (prfSalt) and consts.ts (PasskeySaltBytes, moved there from shapes/vault.ts, which re-exports it) reach no host surface.
