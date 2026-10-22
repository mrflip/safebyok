# streamline: what we relaxed, or were told to relax

The Coach (2026-10-22): "Write down every similar thing that needs to be relaxed or that we told
you to relax." One entry per guarantee given up or narrowed, for the security audit after the
sprint. CAPITALS mark the concerns the Coach asked to see plainly. Each says what a user or host
would see, and where it was decided. The orchestrator keeps it; threads report new entries.

## Given up

1. **A RESTORED BACKUP THAT ROLLS BACK BOXES ALONE GOES UNNOTICED.** `vault_epoch` moves only on
   writes to the vault's core fields (the Coach, 2026-10-22), so storage serving older boxes under
   the same gate is accepted. If it proves blocking: bind `vault_epoch` into each box's ctx.
   Otherwise left for the audit. (thread 5)
2. **A LOCK LANDS AFTER THE TURN IN FLIGHT** *(pending the Coach's ruling)*: a call already at
   work when `lock()` is asked finishes and hands back its result, a whisper included. **AND IF
   A STORAGE CALL HANGS RATHER THAN FAILS, THE LOCK NEVER LANDS AND THE VAULTKEY STAYS IN
   MEMORY** (the same for `close()` and the expiry); before, `lock()` dropped it at once. The
   Contract still says a lock locks at once. Each call checks `checkUnlocked` inside its turn.
   (#245, thread 3)
3. **NO WAY OUT IN THE APP FOR A VAULT STORED BEFORE THE RENAMES.** Its props read as
   `damaged_vault` and `delDamagedVault` cannot clear them; the host clears storage by hand.
   Old and new builds on one backend see each other's records as damaged. No back-compat before
   1.0, confirmed. (#243)

## Narrowed

4. **A picture up to `staleMinutes` old is timely**, by hello's definition; a call that needs
   more asks `hello({ staleMinutes: 0 })`. (preplan, *The rules*)
5. **A just-made vault's listing can lag its props** in Postgres, when another device creates
   the vault during this device's `ensureVault`: props and listing may describe two instants a
   few milliseconds apart. It never names another vault, and the next hello catches up.
   *(Re-raised: the Coach approved it only if inconsistency is impossible, which strictly it is
   not.)* (#244)
6. **The stores are looser than the core's door**: Postgres's nullable `passphrase` column and
   Convex's one-object validator would hold a gated vault with no passphrase, if something
   wrote past the core. It reads back `damaged_vault`. Our app never writes one. (#244)
7. **A VaultDB's stale vault props write carries the whole standing record** (salts, wrapped
   vaultKeys) in `meta.vault_props_stored`; the vault strips it at its own surface. Over GraphQL
   it rode in error extensions, which servers log: moving to the response body (wire_meta).
   (#244)
8. **Cancel during an attempt already at work** completes the unlock, as the proof was given.
   *(Pending; thread 8's Gating to say it plainly.)* (#245)
9. **A device record's remembered value can be lowered across tabs**: two tabs read it, and the
   later write wins with the lower value. Thread 5's "highest `vault_epoch` seen" inherits this.
   (#245, thread 5)
10. **More reads, not fewer**: a burst of change-bell rings is a read each, and `onBadNews`
    hears a refusal once per read that met it. *(Pending.)* (#245)
11. **A long `staleMinutes` means no twilight**: one at least as long as the lease would make
    every call ask, so it counts as none. *(Pending.)* (#245)
