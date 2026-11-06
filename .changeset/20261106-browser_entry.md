---
"safebyok": minor
---

**A new entry point, `safebyok/browser`, holds the Argon2id key derivers: `argon2idWebV1Deriver`, the deriver for the `argon2id_web_v1` label, and `argon2idDeriver(spec)`, which makes one from a spec of your own.** It also exports the types `KeyDeriver`, `Argon2idKeyDeriver` and `KeyDeriverSpec`. Pass a deriver to `Bank.make` as `keyDeriver`. The derivers are not on the front door, `safebyok`, because most apps will not want this JavaScript implementation and will prefer the faster WebAssembly one (`safebyok-fastkey`); an app that never imports `safebyok/browser` never ships it. The entry carries no strength checker and no device store: the new core has no zxcvbn checker, and the IndexedDB device store is an adapter package. `Bank.make`'s notice of a `test_` key deriver now names `safebyok/browser` as where to find `argon2idWebV1Deriver`.
