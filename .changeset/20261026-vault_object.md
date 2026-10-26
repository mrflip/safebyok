---
"safebyok": minor
"safebyok-react": minor
---

**Breaking: a Vault object's own fields are its stamp, and everything that changes is read through `vault.snapshot`.** A Vault object holds `format`, `applabel`, `user_id`, `vaultlabel`, `vault_tok` and `registered_at` as its own fields, and is frozen: a spread, `JSON.stringify` or a log line of it shows those six alone, and a write over any field, or a spy on a method, throws. The per-field getters are gone; each reads from the snapshot instead:

* `vault.state`, `vault.gate_epoch`, `vault.passphrase`, `vault.passkey`, `vault.boxes`, `vault.damagedBoxes`, `vault.capacity`, `vault.trouble`, `vault.freshness` and `vault.ask_passphrase_at` are `vault.snapshot.<field>`. Before: `if (vault.state === 'locked') { offer(vault.passkey) }`. After: `if (vault.snapshot.state === 'locked') { offer(vault.snapshot.passkey) }`.
* `vault.stamp` is gone: the Vault object is its stamp (`vault.vault_tok`, `vault.registered_at`). Before: `vault.stamp.vault_tok`. After: `vault.vault_tok`. Its epochs are no field of it; `vault.snapshot.gate_epoch` shows the gate's for now.
* `vault.leaseMillis` is each gating's `leaseMillis`, what a dialog says an unlock lasts. Before: `unlockedFor(gating.vault.leaseMillis)`. After: `unlockedFor(gating.leaseMillis)`.
* `vault.keyDeriver` and `vault.now()` are gone: what the vault's boxes, ways in and leases use of them is handed to each as it is made. A host reads its own clock (`Date.now()`).

`getSnapshot` and `subscribe`, on a Vault object and on a Bank, are getters handing out one bound function each for the object's life, as `useSyncExternalStore` wants: `useSyncExternalStore(vault.subscribe, vault.getSnapshot)` works as before, but `Object.keys(vault)` no longer lists them. `vault.logger` stays. `demandConsistentWith` and `consistentWith` take a `VaultMadeUnder` (new): a `vault_tok`, and whichever of the scope and epochs the thing carries, so a thing with its own `format` (a box, a lease) passes as before.

**A Box is one revision of one box, every field it shows its own and frozen.** `{ ...box }` and `JSON.stringify(box)` show its scope, `vault_tok`, `vault_epoch` and `gate_epoch` beside every field of its record but the two ciphered ones (`format`, `whisper_codec` and `whisper_schema_version` among them), where they showed `boxlabel`, `revision_tok`, `sidecar` and its times alone; `box.toJSON()` and `BoxView` are gone. `Box.make(vault, record, madeUnder)` takes what the box is made under (a `VaultSparse` will do) where it read `vault.stamp`, and `Box.seal(vault, props, whisper, { madeUnder, now })` takes it and the time. A Lease's `format` is an own field beside its scope, `vault_tok`, `gate_epoch` and `ask_passphrase_at` (`LeaseSparse` holds it), and `lease.toJSON()` is gone. `sealLeaseRecord(standing, vaultKey, { leaseMillis, now })` takes the scope from the vault record it is handed. `Wayin.make(vaultStamp, record, { keyDeriver })` and `Gate.of(vault, vaultRecord, { keyDeriver })` take the key deriver.

**Types.** `WayinVault`, `GateVault`, `LeaseVault`, `ProvingVault` and `BoxVault` are gone: each collaborator's parameter is written where it is declared. `VaultMadeUnder`, `GatedVaultRecord` (a vault record with its gate) and `VaultDraft` (a novel vault record, as `ensureVault` first stores it) are new, and a `Gating` carries `leaseMillis`.

**safebyok-react.** The dialogs read how long an unlock lasts from the gating (`gating.leaseMillis`), as before from the vault.

**Stored format:** unchanged.
