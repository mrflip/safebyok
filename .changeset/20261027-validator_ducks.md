---
"safebyok": minor
"safebyok-indexeddb": minor
---

**Checks are one parse each, and a refusal names the field that failed.** Most of safebyok's input checks were hand-written sentences, which named nothing. Each is now a parse of the validator for what it was handed. Its refusal keeps its kind, and says `<field>: <what was expected>`. A host that matched a refusal's old wording matches the new one; one that branches on `refusalkind` changes only where this note says.

**Shapes take whatever carries them.** A scope, a stamp or a sparse shape (`VaultScope`, `VaultStamp`, `VaultSparse`, `LeaseStamp`, `BoxSparse`) takes its fields from a Vault object, its record or its snapshot, and leaves the rest. Records stay strict, and so does `BoxStamp`, every field of which a box binds. **The bag naming a vault takes a Vault object, its snapshot or a `BankVault`**, so `bank.closeVault(vault)` works; only a `vaultDB` or `deviceDB` put in it still refuses `bad_scope`.

**Refusals that changed:**

- **`Box.seal`**: a boxlabel that is not a label refuses `bad_option` with the other props, where it refused `bad_scope`.
- **`Bank.make`**:
  - Every option amiss is named in one refusal, led "In Bank.make's options:", where it stopped at the first.
  - A bad option value refuses `bad_option` before a bad `applabel` or `user_id` refuses `bad_scope`.
  - A `vaultDB` without `delDamagedVault` is refused there, not at the first `bank.delDamagedVault`.
- **The options of `idbDeviceDB`, `idbVaultDB`, `browserOpts`, `localVaultDB`, `bank.ensureVault`, `hello` and `ensureUnlocked`**: each refusal is led "In <call>'s options:".
- **`delDamagedVault()` (the function)**: a misspelt or unknown option refuses `bad_option`, where it was dropped.
- **`vault.demandConsistentWith` and `consistentWith`**: a thing whose scope is not labels, or whose epochs are not whole numbers of 0 or more, refuses `bad_option`, naming the field.
- **A passkey's answer**: `prfBytes` from another realm (an iframe, jsdom) is accepted, as a lease's bytes already were.
- **`vault.putBox`**: passes on a `VaultDB`'s `invalid_box` as storage said it, where it said `bad_record`.

**Other changes:**

- `Kit` gains `fn()`, a function check, and `bytes(count?)`, bytes judged by tag.
- Every exported name is unchanged.
- The validators and their types now live in `src/shapes/`, grouped by who imports them.
- No stored shape changed.
