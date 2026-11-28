---
---

None: safebyok is private at 0.0.0, and safebyok-postgres and safebyok-indexeddb change the names they import only. Everything answers as before. For an adapter author: `StoreLimits`, `StoreLimitCap`, `StoreLimitFloor`, `StoreLimitLeastBoxes`, `storeLimitsOf` and `storeQuotaTooSmall` are `DatastoreLimits`, `DatastoreLimitCap`, `DatastoreLimitFloor`, `DatastoreLimitLeastBoxes`, `datastoreLimitsOf` and `datastoreQuotaTooSmall`; the phrase `LifepathNotKept` is `LeadingLifeseqsMoved`, with the same message; a Kids value's per-label `KidEntry` is a `KidLife`; and the gate changes' cleartext types are `ReplacePassphraseCleartexts`, `AddPasskeyCleartexts` and `RevokePasskeyCleartexts` (they were `PassphraseReplaceCleartexts`, `PasskeyAddCleartexts` and `PasskeyRevokeCleartexts`).
