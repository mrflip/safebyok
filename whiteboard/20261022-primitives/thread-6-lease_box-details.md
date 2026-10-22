# Thread 6: lease_box, the details (2026-10-22)

For the reviewer, whoever files the thread, and thread 11 (the Contract). The thread file is
`thread-6-lease_box.md` beside this one.

## Open matters

Each with what I built (the Rec taken) and what the other answer would mean.

1. **LOUD. Ground rule 18 by the store's expectation.** `VaultDB.getBox(scope, boxlabel, { vault_tok })`
   refuses `vault_mismatch` (none, a tombstone, another life), every adapter comparing in the read's
   own step. The vault's `#fetchBox` turns it into `vault_gone` (what was observed: the vault it
   read no longer stands) and sets `#readAt` to `FarPast`, so the next `hello()` reads storage
   whatever `staleMinutes` says. **Rec:** keep. Other answers: the store carries `vault_tok` back
   on the record it reads and the vault's demand judges it (same adapter cost, a new answer shape);
   or `vault_remade` as the kind (the store cannot tell remade from deleted); or no `#readAt` mark
   (the host then needs `hello({ staleMinutes: 0 })`).
2. **LOUD. A whole `putBox()` adopts the listing, unauthenticated.** With both the sidecar and the
   whisper given, `#listedBase` takes the listed `revision_tok` and `registered_at` (audit 7, as
   ruled). The listing is not authenticated, so a `registered_at` altered in storage is sealed into
   the new, authenticated revision on that path. **Rec:** keep, as ruled; a security note says so.
   The partial put still opens the box first, so a sidecar is never laundered.
3. **LOUD. A partial put opens the box even when only the sidecar is left out.** The spec reads and
   keeps the sidecar; I also open it (`tryExtractWhisper`), discarding the whisper, so an altered
   sidecar or `registered_at` is never sealed anew; a box that will not open is written over as
   new, keeping nothing (today's contract). **Rec:** keep. Other answer: read only, and accept the
   laundering of a sidecar altered in storage.
4. **The Lease's stamp has no `vault_epoch`.** The spec's Lease row names `vault_tok` and
   `gate_epoch`; one `vault_tok`'s `gate_epoch` fixes its `vault_epoch`. **Rec:** keep. Other
   answer: store `vault_epoch` in the lease record and its ctx (every device's lease then reads as
   damaged once, and the user unlocks again).
5. **The ciphered fields stay `Ciphered` objects** (`{ cipher_iv_b64, ciphertext_b64 }`), where the
   spec's `cipheredWith` row says strings: a string would change the stored box. **Rec:** keep.
6. **`vault.lease` is public.** `Box.seal` and `box.extractWhisper` are public and read it, as the
   spec's rows have them. A host holding it can decipher what `getWhisper` already opens. **Rec:** keep.
7. **`{ ...box }` and a box's JSON show its whole stamp** (scope, `vault_tok`, both epochs): six
   more fields than a `BoxSummary`. `baseRevisionTok` is a getter, out of the view. **Rec:** keep.
8. **`useWhisper()` of none refuses `absent_box`**; the spec's row is silent, and a callback handed
   null would change its type. **Rec:** keep.
9. **`putBox`'s props are strictly `{ boxlabel, sidecar? }`**: a `Box` handed in is refused
   `bad_option` for its other fields. **Rec:** keep; ergonomics after the sprint, as ruled.
10. **Try pairs on `Box.seal`, `box.extractWhisper`, `lease.cipheredWith`, `decipherWith` and
    `sealProps`**; none on the static `make`s, which refuse only misuse. **Rec:** keep.
11. **`damaged_lease` drops the lease through `vault.tryLock()`**: memory, the prompt landed, and the
    erase, only when it is the lease the vault holds now. **Rec:** keep.
12. **`isConsistentWith`** is the query's name (the triplet ruling). It drops no ended lease and logs
    nothing. **Rec:** keep.

## Refusals where today coped (toldjaso-style; expected, not blockers)

* A lock landing while `putBox()` seals its whisper refuses `vault_locked`, writing nothing: the
  lease demands itself after its seal (it landed before).
* A whole `putBox()` over a listing a moment stale refuses `stale_write` (it read the box first,
  and wrote over whatever stood).
* A box read of a vault deleted, or made anew, elsewhere refuses `vault_gone`: `getWhisper()` was
  `damaged_box`, a partial `putBox()` was `stale_write`.
* A lease whose wrap will not open is taken up, and refuses its first use `damaged_lease`, locking;
  it was discarded at the hello with a warning, the vault opening locked.
* A `Box` held across a change of the ways in refuses `gate_moved` at `extractWhisper()`; a box made
  before a remake refuses `vault_remade` (it was `vault_locked` from `decryptWhisper`).
* A `putBox()` leaving out the whisper where none stands refuses `no_whisper`.

Loosened: `getBox()` lets a lock landing while storage reads through, handing back the box (it
holds nothing secret); `getWhisper()` still refuses `vault_locked`.

## Contract lines this thread makes untrue (for thread 11)

* `vault.putBox(boxlabel, whisper, { sidecar })` is `putBox({ boxlabel, sidecar? }, whisper?)`,
  resolving the `Box` stored (it resolved void).
* `vault.getBox()` and `getWhisper()` resolve null for none (they refused `absent_box`).
* `vault.delBox()` resolves `DeletedBox` (it resolved void).
* `vault.decryptWhisper` / `tryDecryptWhisper`, `box.tryOpen`, `box.open`, `Lease.grant`,
  `lease.tryOpen`, `lease.wrapBoxKey`, `lease.unwrapBoxKey`, `vault.tryDemandConsistentWith` are
  gone; `box.extractWhisper`, `Box.seal`'s new shape, `lease.cipheredWith` / `decipherWith` /
  `sealProps`, `vault.lease`, `vault.isConsistentWith` are new.
* `VaultDB.getBox` takes `expected` and refuses `vault_mismatch`.
* Kinds added: `damaged_lease`, `no_whisper`.

## Races flagged (for `primitives-toldjaso.md`)

* `#takeStoredBox` splices the stored box into the listing over a newer revision a refresh listed
  in the gap (toldjaso 13's family): left as thread 5 left it.
* A take-up now judges the lease it read against the picture standing when the read answers (no
  wait after it): a lease outdated meanwhile is discarded, erased, where the old unwrap's wait left
  it alone. The kept take-up's erase is recorded, not fixed (ruling 6).

## What I looked up

The plan's thread 6 gloss and *Ground rules*; `primitives.md` *Lease*, *Box*, *Races the contract
tests own*; `guarantees-audit.md` risk 7 and *By thread*; the progress file's *Rulings in force* and
*Thread 5*; `thread-5-demand*.md`; `thread-4-store_verbs.md` on `delBox`'s tombstone.
