---
"safebyok": minor
---

**Public surface: the makers take the vault props second, and `Lease.grant` sets its own deadline.** `Box.seal(vault, vaultProps, boxlabel, whisper, vaultKey, opts)` and `Wayin.seal(vault, vaultProps, proof, stamp, vaultKey)` now take the vault props right after the vault, as `Lease.grant` already did: swap the arguments in any direct call. `Lease.grant(vault, vaultProps, vaultKeyPair)` no longer takes `askPassphraseAt`: it ends the lease `vault.leaseMillis` from `vault.clock.now()`, never past `FarFuture`, so a `LeaseVault` stand-in now carries `leaseMillis`. `PassphraseWayin` and `PasskeyWayin` have ordinary public constructors again, taking a record already checked; `Wayin.make` and `Wayin.seal` remain the way to get one.

**No more double-load check.** A `Box` or proof made by a second copy of safebyok (two versions, or the ESM and CommonJS builds side by side) is refused as anything foreign is: `Box.make` and `vault.openBox` refuse it `bad_record`, and `Box.seal`'s `over` and an unlock refuse it `bad_option`. No refusal names a double load any more.

**The event refusal suggests a shorter wrap.** `hello()` and `ensureLease()` handed an event suggest `() => vault.tryHello()` (or `tryEnsureLease`), no braces or `void` needed. No stored shape changed.
