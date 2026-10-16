---
"safebyok": minor
"safebyok-fastkey": minor
---

Key derivers are checked harder, and a passkey can change a passphrase.

**`KeyDeriver` is now a union** (the one breaking change for a host): `Argon2idKeyDeriver`
(a whole `KeyDeriverSpec` beside `key_deriver_label`, `salt_bytes` and `deriveKeyBytes`: what
`argon2idDeriver`, `argon2idWebV1Deriver` and `safebyok-fastkey`'s derivers return) or
`CustomKeyDeriver` (those three fields, and optionally an `algorithm` of the host's naming).
Every field keeps its name. What changes: a deriver no longer takes some of Argon2id's
parameters and not others (it is the whole spec or none), and a class can `implements
CustomKeyDeriver` or `Argon2idKeyDeriver` but not `KeyDeriver` itself. `openVault` now runs
the Argon2id spec check on any deriver declaring `algorithm: 'argon2id'`, so a spec Argon2id
cannot run is refused at open (`bad_option`) rather than failing at the first unlock, and
refuses a label beginning `argon2id_web_` (any case) that is not a spec safebyok supplies. A
label beginning `test_` is warned of through the logger, not refused.

* `changePassphrase(proof, newPassphrase, { unlockId? })` takes any way in as proof, a
  passkey's answer included. Given a passkey's answer on a vault of several passphrases, say
  which to replace with `unlockId` (`bad_option` otherwise). A passphrase proof behaves as before.
* The vault zeroes the bytes a deriver hands back once imported, so a deriver must return a
  fresh array each call, and refuses (`bad_option`) bytes in a `SharedArrayBuffer`.
* `argon2idDeriver`, `argon2idWebV1Deriver` and `argon2idWasmDeriver` refuse a salt of another
  length than the spec's (`bad_option`) before deriving. `ensureSaltFits` is exported for a
  deriver of another implementation to do the same.
* `parseKeyDeriverSpec` now lives in the spec module and refuses the reserved labels too.
* A `wrong_passphrase` beside passphrases made by another key deriver says how many went
  untried, and that opening the vault where it was made may help.
* `UnlockSummary` (the snapshot's `unlocks`) gains `device_id` and `registered_at`.
* New exports: `Argon2idKeyDeriver`, `CustomKeyDeriver`, `ensureSaltFits`.
* `Envelope.sealPassphrase` and `sealPasskey` (internal) return the envelope alone.
