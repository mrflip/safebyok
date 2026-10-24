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
    *Vault and bank*)
15. **A whisper-omitted `putBox` costs a read first**, since the listing carries no ciphertext;
    ergonomics reconsidered after the sprint. (the Coach, 2026-10-22)
16. **A POSTGRES VAULT DELETED AND ENSURED IN THE SAME INSTANT CAN RESTART ITS COUNTER.** Under
    READ COMMITTED, an `ensureVault` statement that began before a `delVault` committed reads no
    tombstone and finds the old row gone, so it starts a new life at `vault_epoch` 0 and the
    fresh tombstone stays beside it. It fails safe: a device that saw a higher epoch refuses the
    new life as `vault_behind` until the host calls `bank.clearCachedVault`. Convex, IndexedDB and
    the local store are unaffected. The cure, if it shows: keep the tombstone as a state of the
    vault row, so one `INSERT ... ON CONFLICT DO UPDATE` decides. (#251 review; the Coach: "don't
    let rollback protection drive any large revisions")
17. **A CHANGE-BELL RING DURING A `vault.refresh()` IN FLIGHT JOINS IT, AND ITS CHANGE IS LOST** until
    the next ring or hello: a write that landed after that refresh's `getVault` began is not shown
    (say, a vault made on another device while this tab shows "Choose a passphrase"). No demand
    catches it, since nothing disagrees: the picture is only old. The Coach: "no, note the concern,
    don't fix: I think it points to the weakness in cross-tab coordination, but the read-re-read
    business is what landed us here." (#253)
18. **THE TAKE-UP KEPT UNTIL THREAD 9 ERASES ON A STALE JUDGMENT.** `#ensureUnlocked` judges a stored
    lease against a picture up to `staleMinutes` old and erases what it cannot open, so a tab whose
    picture predates another tab's change to the ways in can erase that tab's valid lease, which
    re-prompts at its next read. A re-prompt, never a lease kept wrongly. The Coach: "yes record
    don't fix". (#253 review)
19. **NO CROSS-TAB COORDINATION THIS SPRINT.** The mutexes are per tab. Races between tabs (audit
    risks 5 and 9's cross-tab halves, toldjaso 17's lost ring) are settled by the VaultDB's
    expected tokens and the next read, never by a lock across tabs. A Web Locks layer for the
    gating line and the dialog is a later option. The Coach: "don't do cross-tab coordination
    additions this sprint, note your concern and carry on".
20. **SEE IF THIS IS REALLY NEEDED: a partial `putBox` opens the box it reads.** Even when only the
    sidecar is left out, `putBox` calls `getBox` and deciphers the stored box rather than re-wrapping
    it blind, so nothing tampered in storage is re-sealed under this device's key. It costs a
    decipher on every partial put. The Coach: "yes. can you make sure this is noted as a "see if
    this is really needed" in the same place as you are noting the many "see if this is as bad as
    it sounds" loosenings?" (#254)
21. **A VAULT OBJECT HELD THROUGH `bank.clearCachedVault` CAN WRITE A LEASE DURING THE ERASE.** The
    bank erases the device record and the lease before letting the entry go, but a concurrent
    unlock on a Vault object still held can `putLease` while the erase runs. The documented
    `vault_behind` path holds no unlocked Vault object, so it does not arise there. (#259)
22. **A REACT CHILD MOUNTING DURING A USER CHANGE ASKS THE OLD BANK.** A component that mounts in
    the same commit as a `userId` or shaping-prop change renders with the old bank, and its
    `useVault` effect, running after the provider's cleanup, starts a birth on that bank which no
    one lets go. Needs an unusual tree. (#259 review)
23. **CANCEL, THEN ASKED AGAIN.** A call waiting behind a change's dialog (`change_passphrase`,
    `put_passkey`, `del_passkey`) raises its own unlock once that dialog is cancelled. With the
    Cancel button, a user activation, "Unlock your vault" pops up at once; with Escape, which gives
    none, the browser's transient activation (about 5 s) may lapse and the waiting call is declined
    silently. Thread 10's file, *How the joins feel in the UI*, has the rest. (#265)
