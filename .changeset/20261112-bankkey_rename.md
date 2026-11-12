---
"safebyok": minor
"safebyok-graphql": minor
---

**The vaultKey is the `bankKey`.** A wayin, in a gate row (fmt 4001) or a vault row (6002), stores `bank_key_wayin_wrapped`, not `vault_key_wayin_wrapped`, and a lease record stores `bank_key_lease_wrapped`, not `vault_key_lease_wrapped`; the wrap purposes in a ctx are `bank_key_passphrase_wrapped`, `bank_key_passkey_wrapped` and `bank_key_lease_wrapped`. A wayin or lease written under the old names fails today's validation or its wrap does not open, so it reads as damaged. safebyok-graphql's SDL and operations name `bank_key_wayin_wrapped` in a wayin and its input. **Stored format:** the `fmt` numbers do not move (a gate row's and a lease's shapes are new in this unreleased line); only these field and purpose names changed within them.
