---
"safebyok": patch
---

The vault calls its storage adapter's `try` forms itself at each of its six storage sites, checking the Outcome and locking (for storage it cannot trust: `identity_revoked`, `vault_behind`) before it throws, where it once wrapped the adapter in `RefusalPolicy.heed` and unwrapped and rewrapped the Outcome around every call. Nothing a host sees changes: the same refusals, in the same order, with the lease erased before the caller hears; `RefusalPolicy` was never exported.
