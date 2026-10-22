# Thread 6: lease_box (2026-10-22)

Branch `20261022-lease_box`, PR #PRNUM, stacked on [#253](https://github.com/mrflip/safebyok/pull/253). Justify: green (core 2898 passed, 37 skipped; react 287; convex 316; postgres 311; graphql 323; indexeddb 164; fastkey 49; demo 221; e2e 107; root 265). Size: everything 47 kB, Vault 39 kB, idbVaultDB 2.7 kB (raised by the rule). The open matters, the refusals where today coped, the Contract lines this thread makes untrue and the races are in `thread-6-lease_box-details.md` beside this file: the reviewer, whoever files the thread, and thread 11 should read it.

* **Built**:
  * `src/lease.ts`: `Lease.make(vault, record)`, a pure constructor over a record, nothing unwrapped;
    `lease.endsBy`; `lease.cipheredWith(bytes, visible)` / `decipherWith(ciphered, visible)` and
    `lease.sealProps(visible, { whisper })`, each with its `try` form. Each cipher or decipher
    demands the lease (lease-bound) before and after its wait, unwraps the vaultKey for that call
    alone (non-extractable, `wrapKey` or `unwrapKey`), and zeroes the bytes it was handed. A wrap
    that will not open is `damaged_lease`, and the vault's `tryLock()` drops it when it is the lease
    the vault holds. `sealLeaseRecord(vault, standing, vaultKey)` replaces `Lease.grant`; the vault's
    `#grantLease` writes the record and makes its Lease from what the device store answered. The
    take-up judges a stored lease by `vault_tok`, `gate_epoch` and deadline, without unwrapping.
  * `src/box.ts`: `Box.make(vault, record, stamp?)`; `Box.seal(vault, { boxlabel, sidecar?, base? },
    whisper)` with `Box.trySeal`; `box.extractWhisper()` / `tryExtractWhisper()`. A box carries the
    whole stamp; a sealed box carries `baseRevisionTok` (a getter, out of its view).
  * `src/vault.ts` boxes: `putBox({ boxlabel, sidecar? }, whisper?)` resolving the `Box` stored,
    through `#sealAndPutBox` (`#listedBase` for a whole put, `#storedBase` reading and opening for a
    partial one); `getBox` / `getWhisper` resolve null for none; `delBox` resolves `DeletedBox`
    `{ boxlabel, vault_tok, outcome }`; `vault.lease` public; `isConsistentWith`. `#ensureUnlocked`
    takes a `shouldAsk` that may decline to ask.
  * `VaultDB.getBox(scope, boxlabel, { vault_tok })` in every adapter (a subagent built it, one
    commit): `vault_mismatch` from one atomic step where that vault no longer stands. The vault's
    `#fetchBox` maps it to `vault_gone` and sets `#readAt` to `FarPast`.
  * New kinds `damaged_lease` (bad news) and `no_whisper` (condition). `TH.leasedSliceOf`, a vault
    stand-in holding a lease whose vaultKey a test knows.
  * The two races the spec gives this thread, in `vault-races.test.ts`, *the races the contract
    tests own, of a box write* (with a passkey change beside the renewal).
* **Decisions taken**:
  * **Ground rule 18 by the store's expectation**, not by carrying `vault_tok` back: `getBox`
    expects it as `putBox` and `delBox` do, compared in the same step as the read.
  * The Lease's stamp is its record's: scope, `vault_tok`, `gate_epoch`, no `vault_epoch` (the
    spec's Lease row names none, and one `vault_tok`'s `gate_epoch` fixes it). The Box's is whole.
  * The ciphered fields stay `Ciphered` objects, not strings: the stored shape is unchanged.
  * A partial put opens the box it reads, even when only the sidecar was left out, so a sidecar or
    `registered_at` altered in storage is never sealed anew (today's guarantee; the spec reads only).
  * `useWhisper()` of none refuses `absent_box`; the spec's row is silent.
* **Deviations**: `vault.lease` is public (Box.seal and extractWhisper are public, and read it).
  `box.baseRevisionTok` is camelCase, not being stored. The box ctx moved into the lease, byte for
  byte (`ctx-bytes.test.ts` unchanged).
* **Discoveries**:
  * jsdom's `Uint8Array` is another realm's: the lease checks bytes by tag, not `instanceof`.
  * `#ensureUnlocked`'s `beforeAsking` could only throw; `getBox`'s null needed it to decline.
  * The wayin still unwraps a `sessionKey` nothing uses now: thread 8's to remove.
  * Thread 5's splice in `#takeStoredBox` (toldjaso 13) is left as it was.
* **Rulings received (2026-10-22, via the orchestrator)**:
  1. *Demand after each await in every box path.* Each wait in `putBox`, `getBox`, `getWhisper`,
     `useWhisper`, `delBox` and `box.extractWhisper` is followed by a demand on what it brought;
     `extractWhisper` demands the box again after the decipher.
  2. *`box_moved` dropped.* Not added.
  3. *delBox.* No box tombstone stored; `vault.delBox` returns `DeletedBox`, shaped from
     `BoxDeletion`. No case met where a box tombstone would have helped.
  4. *The triplet.* `tryDemandConsistentWith` is gone; `vault.isConsistentWith(thing, { leaseBound? })`
     is the query, pure (drops no ended lease, logs nothing); no `ensureConsistent` yet, as no caller
     needs one.
  5. *Specific names* in the PR and this file.
  6. *Recorded, not fixed*: the ring joined into a read in flight, and the kept take-up erasing on
     a stale judgment. Neither touched.
* **For the Coach**: the details file's open matters, the first three loud.
