---
"safebyok-big": minor
---

A gate's snapshot shows, for each wayin it has, only its `registered_at` (`gate.snapshot.wayins.main.registered_at`, and `passkey0` where there is one), not its header: no salt, `credential_id` or key-deriver label. The new type is `WayinSnapshot`. A host that read a header from the snapshot reads it from `gate.main` or `gate.passkey0`.
