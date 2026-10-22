# Thread 5: demand (2026-10-22)

Branch `20261022-demand`, PR [#253](https://github.com/mrflip/safebyok/pull/253), stacked on [#251](https://github.com/mrflip/safebyok/pull/251). Justify: green (core 2824 passed, 37 skipped;
react 287; convex 306; postgres 301; graphql 312; indexeddb 159; e2e 102). Size: no budget moves
(Vault 34.7 kB, everything 42.4 kB; the rule's budgets are unchanged). The full account of races,
open matters and Contract lines is `thread-5-demand-details.md` beside this file: the reviewer,
whoever files the thread, and thread 11 (the Contract) should read it.

* **Built**:
  * `vault.stamp` (`Stamp`, `Stamped` exported from `types.ts`) and the synchronous
    `vault.demandConsistentWith(thing, { leaseBound? })` with `tryDemandConsistentWith`: vault
    stands (`vault_gone`), scope and `vault_tok` (`vault_remade`), `gate_epoch` equal and
    `vault_epoch` ≤ (`gate_moved`), then the lease half (`vault_locked`, an ended lease dropped).
    It logs the kind and the call, never the fields. Private `#demand`, `#demandLease`.
  * `oneAtATime` joins the run under way. `vault.refresh()`/`tryRefresh()`; `#refresh` joined;
    hello is a sync staleness check then the refresh; the watch's ring calls it through the join.
  * The refresh's judgment (`#takeStorage`, `#takePicture`): older than the picture → ignored,
    tested before the mark's rollback check and again after its wait; the lease dropped (memory
    only) when the vault is gone, remade or re-gated, or when the pantry holds none or a newer
    one, unless the read began before the lease in hand was taken (`#leaseSince`) or found the
    lease the pantry held before it. No take-up in a refresh.
  * `#replaceSnapshot()` the one swap; `lock()` synchronous then the erase (`#lockNow`); the
    expiry, `close()` and revocation drop memory only (`#dropLease`).
  * Box calls: `await #ensureUnlocked()`, demand the lease, read, demand the box (lease-bound),
    write, take what was stored into the listing (`#takeStoredBox`, `#takeBoxDeletion`). Room
    judged from the listing in hand.
  * `del()` takes the deletion into the picture. `TH.holdNextAnswer`, `TH.readAfresh`.
  * Out: `#refreshOnStale`, `#catchUp`, `#isCaughtUpStale`, `#refuseCreatedElsewhere`'s read,
    every after-wait `#checkUnlocked()`, `#greeting`, `#greeted`, `#forgetHello`, `#greet`,
    `#heedRevocation`, `#createsStandDown`, `#outrun`, `#movedOn`, `#shut`, `isNewerCopy`,
    `isCatchingUpKind`, the grant's after-write erase.
* **Decisions taken**:
  * Kept, under the audit and the charge: the take-up path and its `#takeUp` guard (audit 2);
    the grant's check of the Ask's `overtaken` signal beside the demand (the gating clause, thread
    8's); `hello({ staleMinutes: 0 })` first in `unlock()` and `#reviseWayins` (audit 4, pulled
    forward from thread 9); the first-hello memo as `#birth`/`#born` (thread 7).
  * `vault_gone` is "the picture holds no vault", not a Vault object gone for good: today's
    `absent`, and a first unlock that creates, stand until thread 7.
  * The public name stays `ensureLease` (thread 9 reshapes and renames it).
  * Stale box message moved at the store (`StaleBoxMessage`): "another call, here or on another
    device". `vault_mismatch` from `putBox` stays named `stale_write`.
* **Deviations**:
  * **`#leaseSince`** is a field the spec does not name: without it a refresh in flight across a
    first unlock on Convex re-locked the tab at once (the Convex suite caught it). Open matter.
  * `box_moved` is not added: nothing in the spec observes it. Open matter.
  * Box and Lease carry what they carry (box: `vault_tok`; lease: scope and `gate_epoch`); the
    demand reads a partial stamp. Thread 6 gives them the full stamp.
* **Discoveries**:
  * **The joined ring loses changes**: a write elsewhere that rings while a read is in flight is
    not shown until the next ring or hello. Five React tests and a dozen core tests met it; they
    now read afresh (`TH.readAfresh`). Loud open matter.
  * A hold at a DeviceDB's door misorders the pantry: `world.holdNextLease` now holds the answer.
  * A handle holding newer props ignores storage rolled back beneath it; it cannot accept a
    restore, a handle made anew can.
* **For the Coach**: the open matters in the details file, the first three loud.
