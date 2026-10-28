---
"safebyok": patch
---

A gating's attempt spends the passkey's answer it is handed, zeroing its bytes, on every outcome but a refusal the user can correct. Before, an attempt refused before it sealed the answer -- the gating already over (`gating_landed`), another attempt under way (`attempt_in_flight`), a malformed passphrase beside it (`bad_option`), or a lock landing first -- left the bytes as they were. A host that hands the same answer in again after such a refusal now meets `bad_option`: ask the passkey again. A mistyped passphrase in `put_passkey`, or another refusal the user can correct, still leaves the answer unspent, to hand in again.
