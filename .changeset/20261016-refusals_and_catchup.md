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

**New kind, `newer_format`**, a condition: a stored vault in a `format`, unlock method or number of unlocks this version does not know, which a newer safebyok may have written. `openVault` refuses it so (it used to say `damaged_bundle`), and so do `eraseDamagedVault` and `VaultDB.readBundle`. Its next move is "update the app": never offer to erase it. A host switching exhaustively on kinds adds a case.

**The snapshot gains `syncing: boolean`**, true until a read of storage fails -- a change pushed from storage it could not read, a catch-up that failed -- and true again once one succeeds. A host constructing a `VaultSnapshot` of its own adds it.

**One catch-up before a kind is named.** A lockbox that will not open is called `damaged_lockbox` only after the vault has caught up with storage once: one a vault destroyed and made anew elsewhere wrote now makes `read()` and `use()` throw `vault_locked`, the device relocked. A write refused as stale whose catch-up then fails is thrown as `stale_write`, the catch-up's failure its `cause`, and `store()` does not retry it. Refreshes now run one at a time per handle. The storage watch warns once per failing streak, not at every failure, and `log`s once when a read succeeds again.

**A damaged lockbox lists with its `revision_id`** (`{ boxlabel, damaged: true, revision_id }`, null when the record holds none as text), and `store()` over it is one conditional write over that revision, so a sound lockbox another device wrote meanwhile is never erased. A lockbox under a `vault_key_epoch` neither the bundle's nor the prior one's now lists as damaged. A host comparing a damaged entry whole adds the field.

**`openVault` and `eraseDamagedVault` take only an instance of `VaultDB`**: an object that merely carries the verbs is refused `bad_option`.

**`destroy()` on a handle that has seen no vault** reads storage first, and destroys a vault that stands there. A change to the ways in that has landed in storage now resolves even when this device fails to keep its own mark or remembered unlock afterwards; the logger says so.
