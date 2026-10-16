---
"safebyok": minor
"safebyok-fastkey": minor
---

Key derivers are checked harder, and a passkey can change a passphrase. (What a key deriver *is*
changes in this release too: see the `KeyDeriver` class entry.)

* A key deriver whose label begins `argon2id_web_` (any case) and is not a spec safebyok
  supplies, or is one without exactly its parameters, is refused (`bad_option`): those labels are
  reserved for specs safebyok may supply later. A label beginning `test_` is warned of through the
  logger, not refused.
* The vault zeroes the bytes a deriver hands back once imported, so a deriver must return a
  fresh array each call, and refuses (`bad_option`) bytes in a `SharedArrayBuffer`.
* Every deriver refuses a salt of another length than its spec's (`bad_option`) before deriving.
* `changePassphrase(proof, newPassphrase, { unlockId? })` takes any way in as proof, a
  passkey's answer included. Given a passkey's answer on a vault of several passphrases, say
  which to replace with `unlockId` (`bad_option` otherwise). A passphrase proof behaves as before.
* A `wrong_passphrase` beside passphrases made by another key deriver says how many went
  untried, and that opening the vault where it was made may help.
* `UnlockSummary` (the snapshot's `unlocks`) gains `device_id` and `registered_at`.
* `Envelope.sealPassphrase` and `sealPasskey` (internal) return the envelope alone.
