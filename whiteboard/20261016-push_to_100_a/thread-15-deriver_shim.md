# Thread 15: deriver_shim (2026-10-16)

Branch `20261016-deriver_shim`, stacked on #126 (thread 6, `adc94772`). Justify: in progress.

## The design, before building

The Coach's words (#126, *Open Matters*): "yes, shim. Why does it give up a first-class route for
non-Argon algorithms? I'd have an abstract class presenting a facade that our two different
derivers and any conjectured other ones subclass".

```text
KeyDeriver<Spec extends KeyDeriverSpec>        abstract, core (key-deriver.ts)
  constructor(spec)                             the shared floor: ensureKeyDeriverSpec(spec) --
                                                  algorithm and label non-empty text, salt_bytes a
                                                  whole number from 1 to 65536, the reserved
                                                  argon2id_web_ labels -- and 'argon2id' only
                                                  inside the Argon2id family; keeps spec, frozen
  readonly spec, key_deriver_label, salt_bytes, algorithm
  passphraseKeyOf(passphrase, saltBytes)        THE ONE METHOD THE CORE CALLS: deriveKeyBytes,
    -> Promise<CryptoKey>                         then import as the wrapping key, then wipe the
                                                  bytes (finally)
  deriveKeyBytes(passphrase, saltBytes)         the checked bytes: the salt is the spec's length,
    -> Promise<Uint8Array>                        doDeriveKeyBytes runs, its output is a view, not
                                                  shared memory, 32 bytes (wiped when refused).
                                                  Public, for a host testing one deriver against
                                                  another; never overridden
  protected abstract doDeriveKeyBytes(...)      THE RUNNER, all a subclass supplies
  │
  ├─ Argon2idKeyDeriver                         abstract, core: constructor(spec) runs
  │    extends KeyDeriver<Argon2idSpec>           parseArgon2idSpec (Argon2id's floors) before super
  │  ├─ NobleArgon2idDeriver                    core, private: @noble/hashes. argon2idDeriver(spec),
  │  │                                            argon2idWebV1Deriver: frozen instances
  │  └─ WasmArgon2idDeriver                     safebyok-fastkey, private: hash-wasm.
  │                                               argon2idWasmDeriver(spec), argon2idWasmWebV1Deriver
  ├─ TestDeriver                                safebyok/testing: one SHA-256, any spec and runner
  │                                               a test hands it; TH.testDeriver is a frozen one
  └─ (a host's scrypt, a native Argon2id, ...)  another subclass, its own spec type and check
```

* **Specs.** `KeyDeriverSpec` becomes the shape every deriver has: `algorithm`,
  `key_deriver_label`, `salt_bytes`. Argon2id's whole parameter set is `Argon2idSpec` (what
  `KeyDeriverSpec` was), and `parseKeyDeriverSpec` becomes `parseArgon2idSpec`, the Argon2id
  family's own check. `Argon2idWebV1` is unchanged.
* **`openVault`** checks only that `keyDeriver` is an instance of `KeyDeriver` (the floors ran at
  construction, in the class family), and warns of a `test_` label as before. No spec check of
  Argon2id's in `vault.ts`.
* **`envelope.ts`** calls `keyDeriver.passphraseKeyOf(passphrase, saltBytes)`; its own
  `passphraseKeyOf`, the output checks and the wipe move into the base class.
* **Thread 10's all-zero refusal** (`isAllZero`, in `envelope.ts`'s `passphraseKeyOf` on thread
  10's branch) belongs in `deriveKeyBytes`, straight after the length check: the one place every
  deriver's output passes after its runner returns, on the vault's path and a host's alike. The
  restack moves it there; this thread does not add it.
* **Exports.** Added: `KeyDeriver` and `Argon2idKeyDeriver` as classes, `Argon2idSpec`. Gone:
  `CustomKeyDeriver`, `ensureSaltFits` and `parseKeyDeriverSpec` (the base class and the Argon2id
  family do both checks for every subclass). No shim for the old union, before 1.0.
