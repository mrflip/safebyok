# Thread 5: demand, the details (2026-10-22)

For the reviewer, whoever files thread 5, the orchestrator's Open Matters rows, and thread 11
(the Contract). The summary is `thread-5-demand.md`.

## Open matters

Each with what I built meanwhile (the Rec taken) and what the other answer would mean.

1. **LOUD. The watch's ring joins a read in flight, and so loses a change** (U). A write elsewhere
   whose ring arrives while this tab's read is in flight is answered by that read, which may have
   been served before the write: the snapshot misses it until the next ring or hello. Seen: a
   device making the vault (`ensureVault`, then its gate) while this tab shows "Choose a vault
   passphrase" leaves it saying so; a tab's two quick deletes show the second box again (the
   first delete's ring read before the second landed; the second's ring joined it). Built as the
   spec says (a ring is a hello, satisfied by the read in flight). **Rec:** the ring awaits the
   read in flight, then reads once more (one trailing read, `oneAtATime`'s old queue for the ring
   alone); hellos keep the join. Tests that met it now call `TH.readAfresh` (core) or refresh in
   `act` (React).
2. **LOUD. `#leaseSince`: a pantry read older than the lease in hand cannot revoke it** (U, but
   unlock's own contract). Built as the spec says, the refresh dropped the lease whenever the
   pantry held none; a read in flight across this tab's grant (its `getLease` served before
   `putLease`) then re-locked the tab right after `unlock()` resolved. The Convex suite's first
   unlock then `putBox` failed intermittently. Fix: the vault notes when the lease in hand was
   taken; the pantry is judged only by a read begun at or after it, or one finding a newer lease.
   **Rec:** keep. Other answer: drop the field and accept re-prompts after a first unlock on
   stores that ring on their own writes.
3. **LOUD. `box_moved` has no observation.** The spec lists it among the demand's kinds, but a box
   carries its `revision_tok` "which only the store checks", and a stale box write is the store's
   `stale_write`. Not added. **Rec:** drop it from *Kinds this tab adds*, or name what it observes.
4. **The demand's kinds where `vault_locked` was** (Contract change, per the spec's kinds): an
   `unlock()` that races a deletion, remake or gate change refuses `vault_gone`, `vault_remade` or
   `gate_moved`; a `getBox()`/`getWhisper()`/`useWhisper()`/`putBox()` whose vault was deleted or
   remade while storage read the box refuses `vault_gone`/`vault_remade`. A lock during the read
   still refuses `vault_locked`. **Rec:** take (the spec's kinds); thread 11 writes them.
5. **`vault_gone` is "the picture holds no vault"** (the Rec of the store_verbs row, narrowed):
   the Vault object is not made gone for good, since nothing yet can make another (no bank).
   After `del()` or a deletion elsewhere it shows `absent`, and a first unlock creates, as today.
   **Rec:** thread 7 makes a deleted Vault gone.
6. **A cancel landing while an attempt writes its lease** leaves the lease in the pantry; this
   tab stays locked in memory, and the next `ensureLease()` takes it up with no prompt. The spec
   disagrees with itself here: toldjaso 8 says such an attempt "completes", and `grantLease` step
   7 (audit 1) throws on a settled gating. **Rec:** thread 8 rules: either the attempt completes
   in memory too, or a decline erases behind the write as a lock does.
7. **A handle holding newer vault props cannot accept a restore.** It ignores the older copy
   (never `rolled_back`), so the class doc's "erase the mark and hello again" now needs a handle
   made anew. **Rec:** thread 7's `clearCachedVault`.
8. **Kept mechanisms, named:** the take-up's `#takeUp` AbortController (audit 2, until thread 9);
   the grant's check of the Ask's `overtaken` signal (the gating clause; thread 8 makes it the
   proving's `gating_landed`, thread 9 removes Ask's controllers); `hello({ staleMinutes: 0 })`
   first in `unlock()` and the ways-in changes (audit 4, pulled forward); `#birth`/`#born` (the
   first-hello memo, thread 7); `#reviseWayins`' warned, not thrown, regrant (thread 9's chains).
9. **`tryDemandConsistentWith`** exists by the try-pair rule. **Rec:** keep; the other answer is
   to name the demand an exception to the rule.
10. **`WayinStamp`** (device id and time on a way in) now sits beside `Stamp`. **Rec:** thread 8,
    which makes Wayin record-only, renames it.
11. **A device store that cannot read the lease now fails every read**, as it already failed every
    read through `getMark`; a hello that fails so leaves the vault `opening`, not `locked`.

## Races flagged (for `primitives-toldjaso.md`)

* The ring's join (open matter 1): a change elsewhere missed until the next ring or hello. With
  toldjaso 13 (a refresh begun before a local box write puts the old entry back) it compounds: the
  second write's ring joins the stale read, so the old entry stays until a hello.
* A first unlock's make racing a deletion elsewhere, after a read took up the made vault: the
  `#createsStandDown` signal is gone, so the make puts its vault back over "no vault", unlocks it,
  and leaves a lease naming the dead `vault_tok`. Writes into it are refused by storage (a
  tombstone meets no expectation); the next read shows `absent` and drops the lease; the lease
  left is never taken up for a new life. Thread 7's novel Vault (gateless props in the picture)
  closes it.
* A lock in another tab in the same clock millisecond as this tab's grant is seen at the next read.
* `vault_full` is judged from the listing in hand: room another device made shows at a hello.

## Refusals where today coped (toldjaso-style, by the Coach's ruling: expected, not blockers)

* A write refused `stale_write` no longer catches up: the snapshot stays as it was until a hello,
  and a second `putBox()` lands only because it reads the box afresh. A second `del()` or
  `delBox()` refuses `stale_write` again until a hello.
* An `unlock()` proven against vault props that moved meanwhile refuses `vault_gone`,
  `vault_remade` or `gate_moved`, where it refused `vault_locked`.
* A box call whose vault was deleted or remade while storage read the box refuses `vault_gone`
  or `vault_remade`.
* `putBox()` refuses `vault_full` from the listing in hand, where it read storage first.
* A handle holding newer vault props refuses a change of the ways in as `stale_write` over storage
  rolled back beneath it (it was `rolled_back`, the handle emptied).
* The lease from another tab's renewal, or a lock in another tab, now drops this tab's lease at
  its next read; the next `ensureLease()` takes up what the pantry holds.

## Loosenings and the thread that closes each

* The ring's lost change (open matter 1): no thread yet. The Rec is a later coordination layer.
* The first unlock's make racing a deletion: thread 7 (a novel Vault).
* A cancel during the lease write: thread 8 (`grantLease` step 7) and thread 9 (the gating).
* A same-handle restore: thread 7 (`clearCachedVault`).
* Box and lease stamps partial: thread 6.

## Contract lines this thread makes untrue (for thread 11)

* `putBox`: "the snapshot shows the box as storage now holds it" after `stale_write`; "Refuses
  'vault_locked', writing nothing, when the vault was deleted, made anew or had its ways in
  changed elsewhere" (now `stale_write`, or lands: a box write expects no `gate_epoch`); "a vault
  that looks full is caught up with storage before it refuses".
* `delBox`: "refuses 'stale_write' once this device has caught up"; the vault-gone message.
* `del`: "refuses 'stale_write' once this device has caught up: a second `del()` deletes the vault
  the snapshot then shows" (now: `hello()` first).
* `unlock`: "A vault deleted, made anew, or with its ways in changed while the unlock is under way
  refuses 'vault_locked'".
* `getBox`/`getWhisper`: "A lock, a `del()` ... refuses 'vault_locked'" (a deletion now
  `vault_gone`).
* `hello`: "unless what it read may no longer stand (... or the vault was deleted)"; a later hello
  takes up this device's lease (only the first does; `ensureLease` takes one up before prompting).
* The class doc's catch-up paragraph and rollback paragraph (rewritten here).
* The storage watch: "a ring is answered by a read begun after it" (implicit in `oneAtATime`'s
  queue, now a join).
* The ask's `attempt`: "An attempt still under way then unlocks nothing: a Cancel stays
  cancelled" (open matter 6).
* `lock()`: "awaits no hello, and erases" stays; new: all it changes is done before it returns.

## Kinds added (each owed a Contract entry)

`vault_gone`, `vault_remade`, `gate_moved` (conditions). `vault_locked` was there.

## What I looked up

The plan's thread 6 to 9 glosses (who renames `ensureLease`, who removes Ask's controllers); the
progress file's *Thread 4*; `revised-outcomes.md` *Lock*.
