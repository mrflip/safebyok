# Thread 6: lease_box (2026-10-22)

Branch `20261022-lease_box`, PR [#254](https://github.com/mrflip/safebyok/pull/254), stacked on [#253](https://github.com/mrflip/safebyok/pull/253). Justify: green (core 2904 passed, 37 skipped; react 287; convex 316; postgres 311; graphql 323; indexeddb 164; fastkey 49; demo 221; e2e 107; root 265). Size: everything 47 kB, Vault 39 kB, idbVaultDB 2.7 kB (raised by the rule). The open matters, the refusals where today coped, the Contract lines this thread makes untrue and the races are in `thread-6-lease_box-details.md` beside this file: the reviewer, whoever files the thread, and thread 11 should read it.

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
    `{ boxlabel, vault_tok, outcome }`; `vault.lease` public; `consistentWith`. `#ensureUnlocked`
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
* **Rulings received (2026-10-22, via the orchestrator)**:
  1. *Demand after each await in every box path*, and the await audit (`guarantees-audit.md` risk
     10, *By thread* 6). Each wait is followed by a demand before anything is made of its answer,
     a refusal included: `vaultDB.getBox` in `#readBox`, `#readBox` and `box.tryExtractWhisper` in
     `#storedBase`, `Box.trySeal` and `#writeOver` in `#sealAndPutBox`, `vaultDB.delBox` in
     `tryDelBox`, `lease.tryDecipherWith` in `box.tryExtractWhisper`, and the vaultKey's unwrap and
     the cipher or decipher in `lease.tryCipheredWith` / `tryDecipherWith`. One private
     `#demandAfterWait(settled, thing, opts)` does it in `vault.ts`; two exceptions, both in its doc:
     a refusal of `UntrustedStorageKinds` comes as it came (heeding it moved the picture), and a
     lease-bound demand after a refused wait asks only the vault half (a `damaged_lease` has dropped
     itself). Tests: vault-boxes *a box call whose vault is made anew elsewhere during its wait*
     (`getBox`, `putBox`, `delBox` refuse `vault_remade`), lease.test's decipher racing a remake.
  2. *`box_moved` dropped.* Not added.
  3. *delBox.* No box tombstone stored; `vault.delBox` returns `DeletedBox`, shaped from
     `BoxDeletion`. No case met where a box tombstone would have helped.
  4. *The triplet.* `tryDemandConsistentWith` is gone; `vault.consistentWith(thing, { leaseBound? })`
     is the query, pure (drops no ended lease, logs nothing); no `ensureConsistent` yet, as no caller
     needs one.
  5. *Specific names* in the PR and this file.
  6. *Recorded, not fixed*: the ring joined into a read in flight, and the kept take-up erasing on
     a stale judgment. Neither touched.
* **Rework after review (2026-10-22, the orchestrator's directives)**:
  1. *No key through `vault.lease`.* `Lease`'s public `record` getter is gone; `leaseRecordOf(lease)`
     in `src/lease.ts`, set by a static block and exported from no entry point, is how `lease.test.ts`
     reaches it. `vault.lease` stays public. The Box shows no key: `box.record` holds only what
     storage holds. vault-boxes *the Vault object's public surface* walks every field and getter
     reachable from an unlocked Vault (lease and snapshot included) and finds no CryptoKey and no
     wrapped key; it fails with the getter put back. The security note is corrected (sonnet).
  2. *`getBox` of none resolves null* was already built; `getWhisper` also resolves null, as the
     spec's row says, and only `useWhisper` and `delBox` refuse `absent_box`. I kept that: a get
     that answers null reads the same for the box and the whisper.
  3. *`putBox({ boxlabel })` leaving out the whisper of a box the listing does not show* declines to
     ask (`shouldAsk` of `given !== undefined || #isListed(label)`) and refuses `no_whisper` at once.
  4. *`consistentWith`* (the Coach) in place of `isConsistentWith`, everywhere. No try pairs for the
     static `make`s (the Coach), as built.
* **For the Coach**: the details file's open matters, the first three loud.
