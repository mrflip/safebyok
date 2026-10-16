---
"safebyok": minor
"safebyok-react": minor
---

**`lockSoon()` is a soft lock.** It still closes the door at once -- the snapshot reads `locked`, new reads, uses, stores and erases refuse `vault_locked`, and this device forgets its remembered unlock -- but work in hand now finishes: an `unlock()` or `changePassphrase()` already under way, in this tab or another, completes and leaves the vault unlocked, and `lockSoon()` no longer raises the device mark's lock generation. `lock()` is unchanged: it wins over anything under way. `lockSoon(0)` is still `lock()`.

**A hard lock now stops a read in flight.** A `read()` or `use()` under way when `lock()`, `destroy()` or a lock for untrusted storage lands refuses with `vault_locked`, and the whisper it had deciphered is dropped, never handed back. A soft lock lets it finish.

**`whenIdentityRevoked` is gone.** A vault always locks when storage refuses it as `identity_revoked`; an adapter raising that on a passing fault is the bug (VAULTDB.md 5.5). Remove the option from your `openVault` and `VaultProvider` props. `IdentityRevokedResponseVals` and the `IdentityRevokedResponse` type are no longer exported.

**`rolled_back` locks too.** Storage handing back an older copy of the vault than this device has seen now drops the key and forgets the remembered unlock, at open, at unlock and in a background refresh, exactly as `identity_revoked` does. After a deliberate restore, the README's `eraseMark` recipe is still the way out.

**The device mark's shape changes** to `safebyok-mark-v3`: `{ format, applabel, user_id, vaultlabel, lock_generation, seen }`, where `seen` holds the `device_id`, `vault_id`, `unlock_epoch` and `vault_key_epoch` of the vault this device has seen under the scope, or null for none. `destroy()` no longer erases the mark: it raises its lock generation and forgets what it has seen, so an unlock under way elsewhere on the device loses to the destroy. A `lock()` on a scope with no mark writes one with nothing seen, so it stops another tab's first unlock too. A mark written before this reads as none, once. A host's own `DeviceDB` stores the mark as given, as before. The new type `SeenVault` is exported.

**Every failure of the device's own store** now reaches a vault call as `storage_unavailable`, the store's error as its cause -- `openVault`'s first look at the device mark among them, and a `lock()` whose erase fails, which still leaves the snapshot `locked`.
