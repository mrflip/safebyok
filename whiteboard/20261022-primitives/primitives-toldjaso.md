# primitives: what we relaxed, or were told to relax

The Coach (2026-10-22): "Write down every similar thing that needs to be relaxed or that we told
you to relax." One entry per guarantee given up or narrowed, for the security audit after the
sprint. CAPITALS mark the concerns the Coach asked to see plainly. Each says what a user or host
would see, and where it was decided. The orchestrator keeps it; threads report new entries.

## Given up
Carried from `whiteboard/20261021-streamline/streamlined-toldjaso.md` on 2026-10-22; entries 2, 8
and 11 are restated for the demand model.

## Given up

1. **A RESTORED BACKUP THAT ROLLS BACK BOXES ALONE GOES UNNOTICED.** `vault_epoch` moves only on
   writes to the vault's core fields (the Coach, 2026-10-22), so storage serving older boxes under
   the same gate is accepted. If it proves blocking: bind `vault_epoch` into each box's ctx.
   Otherwise left for the audit. (thread 4)
2. **WORK UNDER WAY WHEN A LOCK LANDS completes or throws by its own contract**, which is not
   uniform: `putBox` refuses `vault_locked` when the lock lands before the seal and lands when it
   comes during it; `delBox` lands; `getBox`, `getWhisper` and `useWhisper` refuse after their
   read. `lock()` is synchronous and drops the key at once; the turn-queue version that kept the
   key during a hung storage call is withdrawn. (thread 5)
3. **NO WAY OUT IN THE APP FOR A VAULT STORED BEFORE THE RENAMES.** Its props read as
   `damaged_vault` and `delDamagedVault` cannot clear them; the host clears storage by hand.
   Old and new builds on one backend see each other's records as damaged. No back-compat before
   1.0, confirmed. (#243)

## Narrowed

4. **A picture up to `staleMinutes` old is timely**, by hello's definition; a call that needs
   more asks `hello({ staleMinutes: 0 })`. (the spec, *The rules*)
5. **A just-made vault's listing can lag its props** in Postgres, when another device creates
   the vault during this device's `ensureVault`: props and listing may describe two instants a
   few milliseconds apart. It never names another vault, and the next hello catches up. (#244)
6. **The stores are looser than the core's door**: Postgres's nullable `passphrase` column and
   Convex's one-object validator would hold a gated vault with no passphrase, if something
   wrote past the core. It reads back `damaged_vault`. Our app never writes one. (#244)
7. **A VaultDB's stale vault props write carries the whole standing record** (salts, wrapped
   vaultKeys) in `meta.vault_props_stored`; the vault strips it at its own surface. Over GraphQL
   it rides in the response body (#246). (#244)
8. **Cancel declines this prompt only**: it never locks an unlocked vault, and an attempt already
   past its demand before `putLease` completes. A cancel or lock before that demand throws
   `gating_landed` and stores nothing. (the spec, *Proving*)
9. **A device record's remembered value can be lowered across tabs** unless written as a
   store-side max; thread 7 writes it so. (#245, thread 7)
10. **More reads, not fewer**: a burst of change-bell rings is a read each (joined when one is in
    flight), and `onBadNews` hears a refusal once per read that met it. (#245)
11. **The twilight is the caller's**: `ensureUnlocked({ renewMinutes })` prompts ahead of the
    deadline only when asked; a `staleMinutes` at least as long as the lease would make every
    call ask, so a caller passes none. (the spec, *Vault and bank*)
12. **A hello joined on a fetch that began before another device's write** gets the older
    picture; the next write refuses `stale_write` again and the second hello fetches fresh. The
    app, not hello, may call it twice. (the Coach, 2026-10-22)
13. **A refresh that began before a local box write and lands after it puts the old entry
    back**; the next write on that box refuses `stale_write` and a hello cures it. Flagged, not
    built around. (the Coach: "ship what we have")
14. **A LATE READ OF THIS TAB'S OWN GATE WRITE IS IGNORED, NOT JUDGED**: data cannot tell it from
    a restored backup, so *behind* is judged against the device record's highest `vault_epoch`
    only. The Coach: "this is why we might have to synchronize gated operations". (the spec,
    *Vault and bank*) *Amended by thread 15 (U6, 2026-10-24):* the refresh now tests *behind*
    before it ignores an older read, so a Vault object holding the newer copy refuses a restored
    one 'vault_behind' and locks, as every other tab does. A late read of its own write is still
    ignored, since the device record is read before the fetch. **A LAGGING READ REPLICA** that
    serves a copy below the record now refuses 'vault_behind' and locks a tab that holds the
    newer copy, where it was ignored: a false alarm, cured by the next hello once the replica
    catches up.
15. **A whisper-omitted `putBox` costs a read first**, since the listing carries no ciphertext;
    ergonomics reconsidered after the sprint. (the Coach, 2026-10-22)
16. **A LOCK AND AN UNLOCK IN ANOTHER TAB, BOTH LANDING BEFORE THIS TAB'S NEXT READ, LEAVE THIS
    TAB UNLOCKED.** A refresh drops the lease in hand only when the device store holds none, or
    one under other ways in; it no longer compares deadlines, so another tab's unlock or renewal
    leaves this tab's lease standing until its own deadline (no flash of 'locked'). The store
    then holds a lease under the same ways in, which this tab cannot tell from a renewal. (the
    Coach on U3, 2026-10-24: "yay"; thread 15)
