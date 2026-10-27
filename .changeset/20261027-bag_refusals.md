---
"safebyok": patch
---

Two refusals of a bank call naming a vault are shorter, and say only what went wrong. A bag with a field it does not take, a name that fails its check, or no bag at all refuses 'bad_scope' with the message the bag's validator makes, naming the failing fields as every validator does; it no longer adds where a vault's own stores go. A bag naming another `applabel` or `user_id` than the bank's refuses 'bad_scope' as before, its message ending "Name the vault by its vaultlabel." where it advised on handing in something of the bank's and making another user's bank. A host branching on the kind (or on `meta.fieldnames`) sees no change.

**Stored format:** unchanged.
