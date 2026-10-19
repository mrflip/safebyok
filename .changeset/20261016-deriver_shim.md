---
"safebyok": minor
"safebyok-fastkey": minor
---

**`KeyDeriver` is an abstract class** (breaking for a host that writes its own deriver): every
key deriver extends it, and `Vault.make` takes nothing else. A plain object carrying
`key_deriver_label`, `salt_bytes` and `deriveKeyBytes`, as a deriver was before, is refused with
`bad_option`; there is no shim for it.

What a host writes now:

* **Most hosts, nothing.** `argon2idWebV1Deriver`, `argon2idDeriver(spec)`, `browserOpts()` and
  `safebyok-fastkey`'s two derivers hand over KeyDerivers already.
* **Another implementation of Argon2id**: `class MyDeriver extends Argon2idKeyDeriver`, with
  `protected doDeriveKeyBytes(passphrase, saltBytes)` deriving at `this.spec`'s parameters, made
  with `new MyDeriver(spec)`.
* **Another algorithm**: `class MyDeriver extends KeyDeriver`, calling
  `super({ algorithm, key_deriver_label, salt_bytes })` and implementing `doDeriveKeyBytes`.

The class does what every deriver shares. It checks the spec as the deriver is made, so a spec
that cannot run is refused (`bad_option`) at construction, no longer at `Vault.make`; and at each
derivation it refuses a salt of another length and anything but 32 bytes of unshared memory, not
all zero, from the runner, makes the passphraseKey, and zeroes the bytes. The vault calls `passphraseKeyOf`;
`deriveKeyBytes` stays public, for testing one deriver against another.

* `KeyDeriverSpec` is now what every deriver has: `algorithm`, `key_deriver_label` and
  `salt_bytes`. Argon2id's whole parameter set, which `KeyDeriverSpec` was, is `Argon2idSpec`;
  `argon2idDeriver` and `argon2idWasmDeriver` take one.
* A deriver's Argon2id parameters are on its `spec` (`deriver.spec.memory_kib`), no longer spread
  on the deriver; `key_deriver_label`, `salt_bytes` and `algorithm` stay on it.
* New exports: `KeyDeriver` and `Argon2idKeyDeriver` (classes) and `Argon2idSpec`. No longer
  exported: `CustomKeyDeriver`, `ensureSaltFits` and `parseKeyDeriverSpec`, whose checks the class
  makes for every deriver.
* `safebyok/testing`: `testDeriver` is a frozen `TestDeriver`. `new TH.TestDeriver(spec?,
  derivation?)` makes one of a test's own (relabelled, counting, held at a gate), and
  `digestDerivation` is its digest; spreading `testDeriver` no longer makes a deriver.
