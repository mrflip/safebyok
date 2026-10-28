---
"safebyok": minor
---

**Renamed:** the `Sanitizer` namespace export of `safebyok` is `HostErrorSanitizer` (its module `host-error-sanitizer.ts`): `HostErrorSanitizer.refusalFor(err, kind, message)` is the same function under the same name, the `VaultError` to throw in place of a foreign error that may quote what it was handed. A host or adapter that imported `Sanitizer` changes the one word. Nothing else of it changes.
