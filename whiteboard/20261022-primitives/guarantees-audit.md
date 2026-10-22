# primitives: guarantees the spec would let fall

*Orchestrator*, 2026-10-22. An `opus` read of `primitives.md` against today's outward guarantees,
before thread 4 landed, found nine places where the spec as written lets one fall. None is in
`primitives-toldjaso.md`. Each fix below keeps today's contract with what the spec already has
(a demand on another thing, a store expectation, the refresh join, a synchronous predicate), and
adds no mechanism inside a primitive. They are YOLO decisions under the Coach's charge ("do not
allow the final guarantee to fall"): each is an Open Matters row, and each is easy to undo.
**Where this file and `primitives.md` differ, this file wins** until the Coach rules otherwise.

S breaks a security or consistency guarantee; U degrades the user's experience only.

## The nine, and what each thread does

1. **A lock that lands during `putLease` is undone by the attach (S; thread 8, with 6).**
   `grantLease` step 7 demands on the stored record, which has no gating to test, so a lock
   landing while `putLease` is in flight is erased from the pantry and then step 8 sets
   `vault.lease` anyway. And if a stored record counted as lease-bound, step 7 would always throw
   `vault_locked` on a first unlock. **Fix:** step 7 is `demandConsistentWith(proving)` (which
   asks `gating_landed`), with no lease half. **Test:** hold `putLease`, lock; expect
   `gating_landed`, no lease in memory or pantry.

2. **A lock during `ensureUnlocked`'s pantry consult is undone by the take-up (S; thread 9).**
   `getLease` in flight, `lock()` lands and erases, the record read before the erase is taken
   up: nothing `lock()` changes is demanded on. Today's `#standDownTakeUp` closed it. **Fix:** the
   pantry consult is the gating's first step (as `revised-outcomes.md` has it): raise or join
   the gating, consult the pantry, demand the gating has not landed, take the lease up and settle
   the gating with success, before the host is ever asked for cleartext. Thread 5 keeps today's
   take-up path for `ensureUnlocked` until thread 9 moves it.

3. **The lease's fit to policy and the twilight (S for policy, U for twilight; threads 7, 9).**
   "Its deadline stands" drops today's check that the deadline is no later than
   `now + leaseMillis`, so a lease granted under a longer setting, or before the clock stepped
   back, is honoured; and `ensureUnlocked({ renewMinutes })` would take its own twilight lease
   back up from the pantry and never prompt. **Fix:** one predicate wherever a stored lease is
   taken up (birth, the gating's consult): the deadline lies past `now + renewMinutes` and no
   later than `now + leaseMillis`, and the lease's `vault_tok` and `gate_epoch` match the gate.

4. **A superseded passphrase or removed passkey opens a stale tab (S; thread 9, thread 4).**
   Another device changes the passphrase; a locked tab whose picture predates it proves against
   its cached gate, unwraps the old wayin (the same vaultKey), and is unlocked; box writes do not
   expect `gate_epoch`, so it reads and writes freely. `del_vault` likewise deletes with an old
   passphrase. Today `#unlockWith` refreshes before proving. **Fix:** each attempt's first step
   is `await vault.hello({ staleMinutes: 0 })`, through the refresh join, and the chain captures
   its base after it; `delVault` expects `{ vault_tok, gate_epoch }` (thread 4, sent as a
   directive). **This bends the preplan's rule 6** ("no call reads on its own, re-reads after a
   prompt"): it is hello's own knob, used once at the start of a chain, never a recovery. The
   Coach's to rule; built this way meanwhile.

5. **A gating of one kind joined by a call of another (S; thread 9).** "A call that needs one
   while it stands joins it": `del()` during an `unlock_vault` gating would resolve void when the
   unlock settles, the vault undeleted; `putWayin` would return having changed nothing. **Fix:**
   `ensureUnlocked` joins any standing gating whose chain ends in a lease (every kind but
   `del_vault`); `putWayin`, `delWayin` and `del` join only a gating of their own kind, and
   otherwise wait for the standing one to settle (the gating line's "a second such call waits"),
   then raise their own.

6. **Nothing raises the device record but birth (S, plus a false positive; threads 7 and 5).**
   A passphrase change (epoch 6), storage restored to 5, and the next birth accepts it, so the
   old passphrase works again. **Fix:** the record is raised (a store-side max) at birth and in
   the refresh from what each fetched, and from what `putGate` and `delVault` returned. In the
   refresh, "older than the picture in hand → ignore" is tested **before** `vault_behind`, so a
   late read of this tab's own write is never a false `vault_behind`. Thread 5 orders the
   refresh's tests; thread 7 adds the record and its writes.

7. **A full `putBox`'s base revision is unnamed (S; thread 6).** With whisper and sidecar both
   given there is no read, and the spec names no base. **Fix:** the base is the listed revision,
   or none when the box is unlisted (a create), as `delBox` and today's code do.

8. **A tab stuck after another device's gate change (U; threads 5 and 9).** Another device adds
   a passkey; this tab's refresh takes the new gate but keeps its lease (the pantry's record is
   unchanged), so every lease demand throws `gate_moved` and `ensureUnlocked` never prompts.
   **Fix:** the refresh drops (memory only) a lease whose `gate_epoch` differs from the fetched
   gate's, and `ensureUnlocked`'s synchronous check counts a lease only when its stamp matches.

9. **"Delete my vault" reports a failure after deleting; a refresh erases another tab's lease
   (U; threads 9, 5, 7).** The `del_vault` chain's `lock()` lands its own gating before it
   settles; and the refresh's erase when `vault_tok` moved can erase another tab's lease from the
   new life. **Fix:** `del_vault` settles with success, then locks. The refresh and birth drop a
   lease from another life without erasing it (`revised-outcomes.md`, ruling 5: never erase on
   a judgment); its record, naming the old `vault_tok`, is never taken up.

## By thread

* **4 store_verbs:** `delVault` expects `{ vault_tok, gate_epoch }` (4).
* **5 demand:** the refresh: late read ignored before any behind check (6); a lease of another
  `gate_epoch` dropped (8); a lease of another life dropped, never erased (9). `ensureUnlocked`
  counts a lease only when its stamp matches the gate (8), and keeps today's take-up path until
  thread 9 (2).
* **6 lease_box:** a full `putBox`'s base is the listed revision (7).
* **7 bank:** the take-up predicate at birth (3); the device record raised at birth, refresh,
  `putGate` and `delVault` (6); birth drops, never erases, a lease of another life (9).
* **8 proving_gate:** `grantLease` step 7 demands on the proving (1).
* **9 gating:** the pantry consult inside the gating (2); the take-up predicate there (3); each
  attempt opens with `hello({ staleMinutes: 0 })` (4); joins by kind (5); `del_vault` settles
  then locks (9).
