Exported from the big_feats sprint doc's "Matter: revocation" tab, 2026-10-16. The doc is the source; this copy is for workers.

# Matter: revocation, and whether the server signs

Written against main after the big_feats merge (`e86125a`), for a session that has the repo and this tab.

## Your question

* "I've been wondering if the remote db server (should/does) also sign the vault key on its end? what does real revocation look like?"

## What's built

* **One vault key per vault, and one envelope per way in.** Each passphrase or passkey wraps the vault key under a key of its own (the unlock envelopes, [#71](https://github.com/mrflip/safebyok/pull/71); passkeys, [#76](https://github.com/mrflip/safebyok/pull/76)).
* **Removing a way in** deletes its envelope and bumps `unlock_epoch`. Other devices' remembered unlocks lapse at their next refresh.
* **The server never sees the vault key, so it can't sign it.** It stores ciphertext only. Its checks are who is signed in, and the versioned update (`unlock_epoch`, `vault_id`). It does no cryptography.

## What removing a way in does, and doesn't

* **It does:** an honest server stops handing out that envelope, so a device that knew only the removed passphrase can't unlock from a fresh copy.
* **It doesn't:** anyone who copied the bundle earlier still holds the old envelope: an old device, a backup, a compromised server. The removed passphrase still opens it, and yields the same vault key. That key still decrypts every lockbox, including ones written after the removal.

## What real revocation looks like

* **(a) Rotate the vault key when a way in is removed.** Make a new random vault key, re-encrypt every lockbox under it, and re-wrap the remaining envelopes. From then on, an old envelope opens only the old key, which reads only what was written before the removal. It costs one write per lockbox, and must be atomic or resumable. This is the standard answer.
* **(b) The server refuses a revoked device.** It needs a device identity the server can check. It helps against a lost device, but not against a stored copy or a compromised server.
* **(c) The server signs each bundle version.** Clients could then detect a rollback, such as an attacker restoring a removed envelope. But a signature proves only that the server published the bundle, not that it is secret, and a compromised server signs whatever it likes. Rollback is better caught in the client, by remembering the highest epoch it has seen.

## Recommendation

* **Now:** say all of this in `notes/security.md`, which was the earlier recommendation.
* **Before 1.0:** build vault-key rotation (a) as its own thread, run when a way in is removed and on demand.
* **Check:** whether a device refuses a bundle whose `unlock_epoch` went backwards. If it doesn't, add that to the rotation thread.
* **Not recommended:** server signing (c). It adds a server key to manage, and it doesn't deliver secrecy.

## Your thoughts

* Yes, do (a)
* Do we have a way to invalidate other devices that is legit under apple/google strict privacy matters -- to lock all entryways on a given device? The UX work needed to support this is non-trivial, so it should be a NOTYET, but let's make sure the data we need is in there
