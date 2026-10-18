---
"safebyok": patch
"safebyok-convex": patch
---

Refusals a user may be shown now say "remove" where they said "retire": vault_full asks the user to remove a lockbox, a damaged lockbox offers to be removed, and stale_write, absent_wayin, last_wayin, vault_locked and damaged_vault say the same. Messages only a developer reads (bad_option, bad_whisper) still name retire(). The lease-revocation warning through the logger now says the lease was revoked, not forgotten. A host matching on a message's text, rather than its kind, will see the new wording.
