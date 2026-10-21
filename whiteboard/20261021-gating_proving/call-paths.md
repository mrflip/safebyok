# gating_proving: why hello and unlock aren't simple

Traced on `20261021-gating_proving`, which sits on trust_lines, in `packages/safebyok/src/vault.ts`
and `ask.ts`. The Coach's target shape: each call awaits its precondition (hello needs none,
unlock needs hello, getBox needs unlock), then does its own work as one round of parallel I/O.
Disagreement fails loudly. At most there is a final check that a lock hasn't landed.

## What the paths do today

Each `→` is an await. During every one of them, the storage watch, the expiry timer, `lock()`,
`close()` or another call can change the vault's fields.

**Cold hello** (`tryHello` → `helloWithin` → `#hello` → `greet`):
`strengthChecker.load` runs alongside the refresh, which goes `getMark` → `getVaultProps` →
`getMark` again → `[putMark]` → `[delLease]`, when the epoch moved → `listBoxes`. Then
`fetchLease` goes `getLease` → `Lease.make` → `lease.tryOpen` (an AES unwrap) → `[delLease]`.
That's six to nine awaits in a row, four of them on the deviceDB.

**Locked ensureLease**: hello as above, or a cached hello → the dialog → `attempt` → `unlockWith`.
That runs `#hello`, which only checks that a first hello happened, then a full `#refresh`, the
same six reads, then derive → `Lease.grant` (a wrap) → `putLease` → `[delLease]`. Back in
`ensureLease`, `helloWithin` runs again; it's cached by now, so it only settles. Then
`checkUnlocked`.

**`unlock()` on a page that hasn't said hello**: the first hello reads everything and takes up the
lease, then `#refresh` reads everything again. That's two full reads before any derivation.

**Create** (`settleUnlock` on an absent vault): strength check → draft (derive and seal) → a third
`getMark` → `ensureVaultProps` → `heedMark`, which does a fourth `getMark` and a `putMark` → derive
again to unwrap what was stored → grant → `putLease`.

## Why they aren't simple

1. **State is committed piecemeal.** `#vaultProps`, `#deviceMark`, `#boxes` and `#lease` are
   written at several points along each path, not once at the end:
   - `heedRevocation` commits new props and the mark in the middle of a read, then awaits
     `delLease` and `listBoxes`.
   - `settleUnlock` writes the props it created.
   - `takeUpLease` and `grantLease` each write the lease.

   Since the fields change under every await, each path has to ask after every await whether the
   world moved. The code does exactly that: `isOvertaken`, `isVoided`, `isOutrun`, `movedOn` and
   `revoked.aborted`, plus `#checkOpen` after waits. Every new await adds a new check, which is
   the "each async point creates a race solved by more async points" you saw.

2. **Four actors write those fields at any moment.** The storage watch (`watchRefresh`, from the
   adapter's subscribe), the expiry timer, `lock()`/`close()`/`del()`, and the calls themselves
   all write the shared fields directly. None of them goes through a single commit.

3. **Hello does three jobs.**
   - It's the first open.
   - It's the refresh-if-stale.
   - It's a memoized precondition that every call awaits ("every call on the vault but `lock()`
     and `close()` waits for a first hello"). That job is `#hello()`, which ignores staleness.

   Keeping those three apart takes `#greeting`, `#greeted`, `#forgetHello` and `#readAt`, plus
   `oneAtATime` underneath. It also explains why unlock calls `#hello()` *and then* `#refresh()`:
   the first waits for the memo, the second gets the freshness it really wanted. You noticed the
   contract has hello doing two things; the code has three.

4. **Taking up the lease is a second async stage tacked onto hello.** After the read, hello does
   its own read of the lease, then an unwrap, then sometimes an erase. A lock or an unlock can land
   during that stage, which is why the take-up needs an abort controller of its own (`#takeUp`).
   `dropKey` and `grantLease` both call `standDownTakeUp`.

5. **The mark is read twice in each refresh.** It's read once before the props, so the props can
   be held to it, and again before raising it, in case another tab raised it meanwhile. That's a
   read-modify-write across tabs without compare-and-swap, defended with a second read.

6. **The abort controllers all mean the same thing:** a write that began before X must not land
   after X. There are five of them:
   - `#createsStandDown`: a create must not put its props back once a read has seen the vault
     deleted.
   - `#takeUp`: a lease take-up must not land after a lock or an unlock.
   - Ask's `#over`: an attempt must not unlock after the dialog was answered or a lock landed.
   - Ask's `#landed`: refuses the waiters and settles `lockLanded`.
   - `grantLease`'s `overtaken`: threaded through from Ask.

   Abort is push-based, non-local control flow; it's your GOTO. A generation counter, read when a
   call starts and compared at one commit, says the same thing as a pull. `lockLanded` stays as a
   promise, because the dialog really does need that event, but the core stops using it for
   control flow.

7. **There's leftover from earlier designs.**
   - `ensureLease`'s second `helloWithin`, after an `unlocked` answer, only settles; the attempt
     had already committed the lease.
   - The refresh after hello in `unlockWith` exists so a stale cache can't "bury props written
     elsewhere under a different vault_id". A fresh read as the precondition says the same thing
     with one read instead of two.

## What the mark is, and whether it earns its place

`DeviceMark` is in the deviceDB, one per scope: `{ device_id, vault_id, unlock_epoch }`, described
as "the newest copy of the vault this device has seen." It has two jobs:

- **device_id**: this device's random id for the vault. Every wayin it seals carries it. The mark
  is the only durable per-device, per-vault record: the lease goes away at each lock, but the mark
  outlives locks. That's why the mark isn't simply part of the lease.
- **Rollback check**: props whose `unlock_epoch` is lower than the one seen are refused as
  `rolled_back`. That locks the vault and forgets the props.

The other counters: `vault_id`, which changes when the vault is deleted and remade;
`unlock_epoch`, the gate's version, used for compare-and-swap on wayin changes and to void leases;
each box's `revision_tok`, compare-and-swap per box; and the lease's `vault_id`, `unlock_epoch`
and `ask_passphrase_at`. Only the mark is kept on the device side as a high-water mark.

The catch is in its own doc comment: "The unlock epoch is bound into nothing." A wayin's ctx binds
the scope and `vault_id`, and the epoch isn't in it (`wayin.ts:20`). So storage acting in bad
faith can serve old wayins at a raised epoch, and the mark passes them. What it catches is an
honest restore from backup, and what it adds there is a clearer refusal than the confusing
`wrong_passphrase` that follows otherwise. Against that, it costs:

- two `getMark`s and maybe a `putMark` on every read;
- `heedMark`, `raiseMark`, `raiseMarkAfter`, `markSeeing` and `keptMark`;
- the `rolled_back` path through `heedRefusal` and `forgetVaultProps`;
- `#drafted`, so a create and its mark agree on device_id;
- `deviceIdFor`'s `stale_write`.

The deviceDB's messages also still describe the mark as holding "how often it has locked"
(`device-db.ts:174`), which is stale from the softlock days.

## The shape that fixes it: read, judge, commit

Each call has the same four steps.

1. `await` its precondition. Hello has none.
2. Note `era = this.#era`, then do **one round of parallel I/O**:
   `Promise.all([vaultDB reads, deviceDB reads, strengthChecker.load])`.
3. **Judge synchronously**, building the next state on the side. Any crypto the call needs runs
   here, touching no shared field.
4. **Commit** with `#commit(era, next)`. That's one synchronous check (has `era` moved? for an
   unlock or a gate change, are the props in hand still the `vault_id` and epoch it proved
   against?), one assignment, and one `#settle()`. Writes that are only hygiene, like raising the
   mark or erasing a lease that doesn't fit, go after the commit; if they fail, the failure is
   logged, as `raiseMarkAfter` already does.

The rest follows from that:

- **`#era`** is bumped synchronously by anything that voids a key: `lock`, `close`, `del`, expiry,
  and a revocation committed by a read. It replaces `#createsStandDown`, `#takeUp`, Ask's `#over`,
  `grantLease`'s `overtaken` and the five predicates. A getWhisper's final look is the same
  comparison, so the "re-check of lock()" is one line, not machinery. I'd keep it: `lock()` on
  `visibilitychange` is a security gesture, and a whisper handed over after `lock()` returned
  breaks that promise.
- **hello**: if the picture was read within `staleMinutes` and nothing has forced a re-read, it
  settles and returns. Otherwise it reads, judges into absent, locked or unlocked (or refuses:
  damaged, rolled back, inconsistent) and commits, having changed nothing if it refuses. That's
  one job. A first open is just a hello with no picture yet, so `#greeting`, `#greeted` and
  `#forgetHello` reduce to `#readAt` plus a must-read flag. `oneAtATime` stays, to share one read
  among concurrent callers.
- **The storage watch** runs a hello like any other caller. If its commit loses, it does nothing,
  and the next ring reads again.
- **unlock** (a Proving's attempt): precondition is a fresh hello (`staleMinutes: 0`), since the
  proving derives over the wayin's current salt. Then derive and open → grant (wrap) → commit →
  `putLease`. No second read and no take-up to stand down.
- **ensureLease**: precondition is hello. If unlocked, it returns. If not, it raises the gating
  and awaits its answer, and doesn't say hello again.
- **getBox**: precondition is ensureLease, then read → decipher → compare era.

### Guesses, with arguments each way

- **Where the lease is unwrapped.** Option (a): hello unwraps, as now, which adds one crypto await
  between read and commit. Option (b): hello takes up the lease record on synchronous checks alone
  (vault_id, epoch, deadline, and that it fits `leaseHours`), and the Lease unwraps lazily at its
  first use, which fits Lease owning its own crypto (preplan guess (b)). (b) leaves hello with no
  crypto at all. Its cost is that a lease with a damaged wrap shows `unlocked` until its first use,
  then locks and asks. A damaged wrap means a tampered device store, which is rare. Leaning (b).
- **Props and listing in one read.** Option (a): `getVaultProps` and `listBoxes` run in parallel,
  and a listing that names a different `vault_id` refuses the hello. There's no retry inside the
  core; the next hello reads again. Option (b): a single `VaultDB.getVault` that the adapter
  serves from one transaction. (a) needs no adapter change; (b) never sees a split read. Leaning
  (a), and revisiting if split reads show up outside tests.
- **The mark.** Option (a): keep it as is, but read it once, in parallel, and raise it after the
  commit. Option (b): keep `device_id` and drop the rollback check, along with `rolled_back`,
  `#drafted` and most of [Mark]. Option (c): make the check mean something by binding `gate_epoch`
  into each wayin's ctx. A gate change already holds a proving that can reseal the passphrase
  wayin, so this reuses an existing construction. (c) is a security decision for the Coach, and a
  `notes/security.md` entry whichever way it goes. No lean: this one is the Coach's call.
- **Hygiene writes after the commit.** Option (a): logged on failure. Option (b): thrown. The read
  is the contract, and a failed erase of a lease that doesn't fit isn't an inconsistency. Leaning
  (a).
