# Design review: gate, lease, proving, wayin (the models PR)

*Orchestrator, 2026-10-31, for the Coach's item 1. Each concern that needs a decision is a row in Open Matters.*

## Security

1. **`Lease.wrapKey` / `unwrapKey` hand key handles out.** `unwrapKey` answers a non-extractable boxKey to whoever holds a box's wrap and ctx. It breaks the rule that an unwrapped key never leaves a local; the box needs only `sealWith`/`unsealWith`. Remove both (thread 2).
2. **`Proving.makeWayin(source)` does not check the source's vault.** A passkey proving of vault A handed a proving of vault B would wrap B's vaultKey into a wayin of A. Only `Gate` calls it today, with provings it made for one vault, but the check is one line (`vault_tok` agree). Add it (thread 2).
3. **A proving holds its wayinKey for its life.** Fine while provings are transient (made in `Gate.build`, dropped). The gate ops of thread 4 must not keep a proving on the gate or the vault; the rule should say so (ground rule 1 does).
4. **`Wayin.toJSON` shows `salt_b64` and `key_deriver_label`.** The old summary withheld "what a guess at the passphrase needs". Neither is secret, and the stored record shows both to anyone reading storage; but a snapshot reaching a UI need not carry them. Decide: header as now, or the old sparse form.
5. **The vault stamp binds no `format`.** The old wayin ctx did. A new vault `fmt` would then leave old wayins openable, which is the behaviour the old design chose for boxes and leases and refused for wayins. Pre-1.0 either is allowed; say which is wanted.
6. **The host functions that hear the passphrase** (proof closure, key deriver) have their throws replaced with a plain `unexpected_error` and no cause (G1, G8). That means a user cancelling in the dialog reads as a bug. A `declined` kind, or letting the closure answer null, is the fix; it waits on the refusal kinds.
7. **The deviceDB stays inside the trust boundary** (G4's caveat): the dbfriend hands it the lease record with the leaseKey handle, as before. No change, worth restating in the spec.
8. **What is zeroed and what cannot be**: whisper bytes, PRF bytes and key bytes are zeroed in `finally`; the passphrase string and the parsed whisper value cannot be. `Lease.forget()` can only drop references: the leaseKey is a handle and the wrap is ciphertext. Unchanged from the old code; written down so no one goes looking for a zero that cannot exist.

## Design

9. **The gate is not yet in the vault record** (thread 1), so today nothing stores a wayin at all; the Coach's `gate_props` note stands.
10. **`gate_epoch` is gone.** The old lease bound it so a passphrase change elsewhere voided the lease. With the vault's `revision_seq` now moving on every record write, the gate needs its own counter only if a lease must survive non-gate writes (there are none yet besides the gate). Recommend: leave it out until a second payload exists, and have thread 2 lock the vault when the received record's gate differs from the one in hand (the gap review will say the same).
11. **`autolock_at`** replaced `ask_passphrase_at`, since the pester concern moved to the gate. Cheap to revert.
12. **`Lease.get` answers `null` for a kept lease it will not read**, warning without the record, and leaves it in place for the next grant to overwrite. The old code did the same. Fine.
13. **The autolock on a lease the vault never took up** (a kept lease past its time, loaded by `get`): its trigger fires `vault.lock()` and `forget()`; `lock()` finds no lease and only settles. Harmless; thread 2's `#unlock` must check `isInForce` before taking a lease up.
14. **`#leaseChores` is a promise chain no one awaits yet.** Thread 2 awaits it before a grant. Tests will want a way to await it; a `whenLeaseSettled()` or similar is cheap, if wanted.
15. **Refusal messages are inline**, in each module's `// == [Refusals]` section, rather than in `phrases.ts`. Fine while the kinds are in flux; a documentarian pass moves them.
16. **Two things named `LeaseFormat`** exist: the old string in `src/shapes/device.ts` and the new `7001` in `models-shapes.ts`. They never meet; the old one goes with the old code.
